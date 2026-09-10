const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || 3000, 10);
const HOST = process.env.IP || '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'campus_data.json');
const BACKUP_FILE = path.join(DATA_DIR, 'campus_data.backup.json');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const NOTIF_CONFIG_FILE = path.join(DATA_DIR, 'notifications_config.json');
const AUTH_CONFIG_FILE = path.join(DATA_DIR, 'auth_config.json');

// --- Configuración y Estado de Autenticación & Seguridad ---
const DEFAULT_AUTH_CONFIG = {
  enabled: true,
  passwordHash: '',
  salt: '',
  sessions: {},
  failedAttempts: {}
};

function readAuthConfig() {
  try {
    if (fs.existsSync(AUTH_CONFIG_FILE)) {
      const raw = fs.readFileSync(AUTH_CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_AUTH_CONFIG,
        ...parsed,
        sessions: parsed.sessions || {},
        failedAttempts: parsed.failedAttempts || {}
      };
    }
  } catch (err) {
    console.error('[Servidor] Error al leer auth_config.json:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_AUTH_CONFIG));
}

function saveAuthConfig(cfg) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const now = Date.now();
    const cleanSessions = {};
    if (cfg.sessions) {
      for (const [token, sess] of Object.entries(cfg.sessions)) {
        if (sess && sess.expiresAt > now) {
          cleanSessions[token] = sess;
        }
      }
    }
    cfg.sessions = cleanSessions;
    fs.writeFileSync(AUTH_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Servidor] Error al guardar auth_config.json:', err);
    return false;
  }
}

function ensureAuthConfig() {
  if (!fs.existsSync(AUTH_CONFIG_FILE)) {
    saveAuthConfig(DEFAULT_AUTH_CONFIG);
  }
}

function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (e) {
    return false;
  }
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name ? name.trim() : '';
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  if (cookies['campus_session']) {
    return cookies['campus_session'];
  }
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.headers['x-auth-token']) {
    return req.headers['x-auth-token'];
  }
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const tokenQuery = urlObj.searchParams.get('auth_token');
    if (tokenQuery) return tokenQuery;
  } catch (e) {}
  return null;
}

function isClientAuthenticated(req) {
  const authCfg = readAuthConfig();
  if (!authCfg.enabled) {
    return true;
  }
  if (!authCfg.passwordHash) {
    return false;
  }
  const token = getSessionToken(req);
  if (!token) return false;
  const session = authCfg.sessions[token];
  if (!session) return false;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    return false;
  }
  return true;
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const authCfg = readAuthConfig();
  const attempt = authCfg.failedAttempts[ip];
  if (!attempt) return { allowed: true };
  if (attempt.lockUntil && attempt.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((attempt.lockUntil - Date.now()) / 60000);
    return { allowed: false, minutesLeft };
  }
  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const authCfg = readAuthConfig();
  const attempt = authCfg.failedAttempts[ip] || { count: 0, lockUntil: 0 };
  attempt.count = (attempt.count || 0) + 1;
  if (attempt.count >= 5) {
    attempt.lockUntil = Date.now() + 5 * 60 * 1000;
    attempt.count = 0;
  }
  authCfg.failedAttempts[ip] = attempt;
  saveAuthConfig(authCfg);
}

function resetFailedAttempts(ip) {
  const authCfg = readAuthConfig();
  if (authCfg.failedAttempts[ip]) {
    delete authCfg.failedAttempts[ip];
    saveAuthConfig(authCfg);
  }
}

function buildSessionCookie(token, maxAgeSeconds) {
  let cookie = `campus_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAgeSeconds) {
    cookie += `; Max-Age=${maxAgeSeconds}`;
  }
  return cookie;
}

function buildClearSessionCookie() {
  return `campus_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// --- Configuración y Días para Resumen Automático ---
const DEFAULT_NOTIF_CONFIG = {
  enabled: false,
  channel: 'both', // 'email' | 'telegram' | 'both' | 'none'
  time: '07:00',
  lastSentDate: '',
  email: {
    service: 'gmail', // 'gmail' | 'outlook' | 'custom'
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    to: ''
  },
  telegram: {
    botToken: '',
    chatId: ''
  }
};

const DAYS_OF_WEEK = [
  { key: 'lunes', label: 'Lunes', short: 'Lun', dayIndex: 1 },
  { key: 'martes', label: 'Martes', short: 'Mar', dayIndex: 2 },
  { key: 'miercoles', label: 'Miércoles', short: 'Mié', dayIndex: 3 },
  { key: 'jueves', label: 'Jueves', short: 'Jue', dayIndex: 4 },
  { key: 'viernes', label: 'Viernes', short: 'Vie', dayIndex: 5 },
  { key: 'sabado', label: 'Sábado', short: 'Sáb', dayIndex: 6 },
  { key: 'domingo', label: 'Domingo', short: 'Dom', dayIndex: 0 }
];

function getTodayDayKey() {
  const dayIndex = new Date().getDay();
  const found = DAYS_OF_WEEK.find(d => d.dayIndex === dayIndex);
  return found ? found.key : 'lunes';
}

function parseDaysFromSchedule(scheduleText) {
  if (!scheduleText || typeof scheduleText !== 'string') return [];
  const text = scheduleText.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const daysFound = new Set();

  if (/lunes\s+a\s+viernes|lun\s+a\s+vie/i.test(text)) {
    return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  }
  if (/lunes\s+a\s+sabado|lun\s+a\s+sab/i.test(text)) {
    return ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  }

  if (/\blunes\b|\blun\b/i.test(text)) daysFound.add('lunes');
  if (/\bmartes\b|\bmar\b/i.test(text)) daysFound.add('martes');
  if (/\bmiercoles\b|\bmie\b/i.test(text)) daysFound.add('miercoles');
  if (/\bjueves\b|\bjue\b/i.test(text)) daysFound.add('jueves');
  if (/\bviernes\b|\bvie\b/i.test(text)) daysFound.add('viernes');
  if (/\bsabados?\b|\bsab\b/i.test(text)) daysFound.add('sabado');
  if (/\bdomingos?\b|\bdom\b/i.test(text)) daysFound.add('domingo');

  return Array.from(daysFound);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readNotificationConfig() {
  try {
    if (fs.existsSync(NOTIF_CONFIG_FILE)) {
      const raw = fs.readFileSync(NOTIF_CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_NOTIF_CONFIG,
        ...parsed,
        email: { ...DEFAULT_NOTIF_CONFIG.email, ...(parsed.email || {}) },
        telegram: { ...DEFAULT_NOTIF_CONFIG.telegram, ...(parsed.telegram || {}) }
      };
    }
  } catch (err) {
    console.error('[Servidor] Error al leer notifications_config.json:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_NOTIF_CONFIG));
}

function saveNotificationConfig(cfg) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(NOTIF_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Servidor] Error al guardar notifications_config.json:', err);
    return false;
  }
}

// Generador de contenido para Email y Telegram
function compileTodaySummary(campusData) {
  const todayKey = getTodayDayKey();
  const dayObj = DAYS_OF_WEEK.find(d => d.key === todayKey);
  const dayName = dayObj ? dayObj.label : 'Hoy';

  const dateNow = new Date();
  const dateFormatted = dateNow.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayIso = dateNow.toISOString().split('T')[0];

  const classrooms = (campusData.classrooms || []).filter(c => {
    const days = parseDaysFromSchedule(c.schedule);
    return days.includes(todayKey);
  });

  const classroomIds = classrooms.map(c => c.id);
  const allReminders = (campusData.reminders || []).filter(r => !r.completed);
  const todayReminders = allReminders.filter(r => r.dueDate === todayIso || classroomIds.includes(r.classroomId));

  const userName = campusData.userName || 'Estudiante';

  // 1. Telegram Message (HTML compatible)
  let telegramText = `🎓 <b>RESUMEN MATUTINO &bull; ${dayName.toUpperCase()}</b>\n`;
  telegramText += `👤 Estudiante: <b>${escapeHtml(userName)}</b>\n`;
  telegramText += `📅 ${escapeHtml(dateFormatted)}\n`;
  telegramText += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (classrooms.length > 0) {
    telegramText += `📚 <b>TUS CLASES DE HOY (${classrooms.length}):</b>\n`;
    classrooms.forEach((c, idx) => {
      telegramText += `\n<b>${idx + 1}. ${escapeHtml(c.name)}</b>\n`;
      if (c.schedule) telegramText += `   🕒 <b>Horario:</b> ${escapeHtml(c.schedule)}\n`;
      if (c.institution) telegramText += `   🏛️ <i>${escapeHtml(c.institution)}</i>\n`;
      if (c.teacher) telegramText += `   👨‍🏫 Docente: ${escapeHtml(c.teacher)}\n`;
      if (c.notes) telegramText += `   🔑 <i>Nota: ${escapeHtml(c.notes)}</i>\n`;

      const links = [];
      if (c.url) links.push(`<a href="${escapeHtml(c.url)}"><b>Aula</b></a>`);
      if (c.googleUrl) links.push(`<a href="${escapeHtml(c.googleUrl)}"><b>Classroom</b></a>`);
      if (c.meetingUrl) links.push(`<a href="${escapeHtml(c.meetingUrl)}"><b>Meet/Zoom</b></a>`);
      if (c.driveUrl) links.push(`<a href="${escapeHtml(c.driveUrl)}"><b>Drive</b></a>`);
      
      if (links.length > 0) {
        telegramText += `   🔗 ${links.join(' | ')}\n`;
      }
    });
  } else {
    telegramText += `🎉 <b>¡Hoy no tienes clases programadas!</b> Buen momento para repasar o descansar.\n`;
  }

  if (todayReminders.length > 0) {
    telegramText += `\n📌 <b>RECORDATORIOS Y ENTREGAS (${todayReminders.length}):</b>\n`;
    todayReminders.forEach(r => {
      telegramText += `  • <b>${escapeHtml(r.title)}</b>`;
      if (r.dueDate) telegramText += ` (📅 ${escapeHtml(r.dueDate)} ${escapeHtml(r.dueTime || '')})`;
      if (r.details) telegramText += `\n    📝 ${escapeHtml(r.details)}`;
      telegramText += `\n`;
    });
  }

  telegramText += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  telegramText += `🚀 <i>¡Que tengas una excelente jornada académica!</i>`;

  // 2. Email HTML
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
      <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; padding: 24px; text-align: left;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800;">🎓 Resumen Matutino &bull; ${escapeHtml(dayName)}</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">¡Buen día, <strong>${escapeHtml(userName)}</strong>! Aquí tienes tu agenda para hoy (${escapeHtml(dateFormatted)})</p>
        </div>

        <div style="padding: 24px;">
          <!-- Clases -->
          <h2 style="font-size: 16px; color: #0f172a; margin-top: 0; margin-bottom: 14px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
            📚 Clases del Día (${classrooms.length})
          </h2>
          ${classrooms.length > 0 ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 20px;">
              ${classrooms.map(c => `
                <tr>
                  <td style="padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 5px solid ${c.color || '#4f46e5'}; border-radius: 8px;">
                    <div style="font-size: 16px; font-weight: bold; color: #0f172a; margin-bottom: 4px;">${escapeHtml(c.name)}</div>
                    ${c.schedule ? `<div style="font-size: 13px; color: #4338ca; font-weight: 700; margin-bottom: 4px;">🕒 Horario: ${escapeHtml(c.schedule)}</div>` : ''}
                    ${c.institution ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">🏛️ ${escapeHtml(c.institution)}</div>` : ''}
                    ${c.teacher ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">👨‍🏫 Docente: ${escapeHtml(c.teacher)}</div>` : ''}
                    ${c.notes ? `<div style="font-size: 12px; color: #475569; font-style: italic; background-color: #ffffff; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px;">🔑 ${escapeHtml(c.notes)}</div>` : ''}
                    
                    <div style="margin-top: 10px;">
                      <a href="${escapeHtml(c.url)}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">🔗 Ingresar al Aula</a>
                      ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📚 Google Classroom</a>` : ''}
                      ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📹 Meet / Zoom</a>` : ''}
                      ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📁 Drive</a>` : ''}
                    </div>
                  </td>
                </tr>
                <tr><td height="10" style="font-size:0; line-height:0;">&nbsp;</td></tr>
              `).join('')}
            </table>
          ` : `
            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; color: #64748b; margin-bottom: 20px;">
              🎉 ¡Hoy no tienes clases programadas! Excelente oportunidad para repasar o descansar.
            </div>
          `}

          <!-- Recordatorios -->
          ${todayReminders.length > 0 ? `
            <h2 style="font-size: 15px; color: #0f172a; margin-top: 14px; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
              📌 Recordatorios y Entregas (${todayReminders.length})
            </h2>
            <ul style="padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">
              ${todayReminders.map(r => `
                <li>
                  <strong>${escapeHtml(r.title)}</strong>
                  ${r.dueDate ? `<span style="color: #b45309; font-weight: bold;"> (📅 ${escapeHtml(r.dueDate)} ${escapeHtml(r.dueTime || '')})</span>` : ''}
                  ${r.details ? ` - <span style="color: #64748b;">${escapeHtml(r.details)}</span>` : ''}
                </li>
              `).join('')}
            </ul>
          ` : ''}

          <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            Enviado automáticamente por tu sistema <strong>Mi Campus Personal</strong> desde tu PC principal.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return {
    dayName,
    dateFormatted,
    classroomsCount: classrooms.length,
    telegramText,
    emailHtml,
    emailSubject: `🎓 Resumen Académico: ${dayName} (${classrooms.length} ${classrooms.length === 1 ? 'materia' : 'materias'})`
  };
}

// Envío a Telegram via HTTPS
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    if (!botToken || !chatId) {
      return reject(new Error('Falta el Bot Token o el Chat ID de Telegram'));
    }

    const payload = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve(json);
          } else {
            reject(new Error(json.description || 'Error desconocido de Telegram'));
          }
        } catch (e) {
          reject(new Error(`Respuesta inválida de Telegram: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tiempo de espera agotado al conectar con Telegram'));
    });

    req.write(payload);
    req.end();
  });
}

// Envío de correo vía SMTP nativo con soporte TLS y STARTTLS
function sendSmtpEmail({ host, port, secure, user, pass, to, subject, htmlBody }) {
  return new Promise((resolve, reject) => {
    if (!user || !pass || !to) {
      return reject(new Error('Faltan credenciales de correo (usuario, contraseña o destinatario)'));
    }

    const smtpHost = host || (user.endsWith('@gmail.com') ? 'smtp.gmail.com' : 'smtp.office365.com');
    const smtpPort = port ? parseInt(port, 10) : (secure ? 465 : 587);
    const cleanPass = pass.replace(/\s+/g, '');

    const boundary = '----=_Part_' + Date.now().toString(36);
    const mimeMessage = [
      `From: "Mi Campus Personal" <${user}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(htmlBody, 'utf8').toString('base64'),
      ``,
      `--${boundary}--`,
      ``
    ].join('\r\n');

    let isTlsEstablished = false;

    function handleDialog(sock) {
      let state = 'INIT';
      let buffer = '';

      sock.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop();

        for (const line of lines) {
          const code = parseInt(line.substring(0, 3), 10);
          if (isNaN(code)) continue;
          if (line.charAt(3) === '-') continue;

          if (state === 'INIT' && code === 220) {
            state = 'HELO';
            sock.write(`EHLO localhost\r\n`);
          } else if (state === 'HELO' && code === 250) {
            if (!isTlsEstablished && (smtpPort === 587 || smtpPort === 25)) {
              state = 'STARTTLS';
              sock.write(`STARTTLS\r\n`);
            } else {
              state = 'AUTH';
              sock.write(`AUTH LOGIN\r\n`);
            }
          } else if (state === 'STARTTLS' && code === 220) {
            isTlsEstablished = true;
            const tlsSocket = tls.connect({
              socket: sock,
              host: smtpHost,
              rejectUnauthorized: false
            }, () => {
              handleDialog(tlsSocket);
              tlsSocket.write(`EHLO localhost\r\n`);
            });
            tlsSocket.on('error', (err) => reject(err));
            return;
          } else if (state === 'AUTH' && code === 334) {
            state = 'USER';
            sock.write(`${Buffer.from(user).toString('base64')}\r\n`);
          } else if (state === 'USER' && code === 334) {
            state = 'PASS';
            sock.write(`${Buffer.from(cleanPass).toString('base64')}\r\n`);
          } else if (state === 'PASS' && (code === 235 || code === 250)) {
            state = 'FROM';
            sock.write(`MAIL FROM:<${user}>\r\n`);
          } else if (state === 'FROM' && code === 250) {
            state = 'RCPT';
            sock.write(`RCPT TO:<${to}>\r\n`);
          } else if (state === 'RCPT' && code === 250) {
            state = 'DATA';
            sock.write(`DATA\r\n`);
          } else if (state === 'DATA' && code === 354) {
            state = 'BODY';
            sock.write(`${mimeMessage}\r\n.\r\n`);
          } else if (state === 'BODY' && code === 250) {
            state = 'QUIT';
            sock.write(`QUIT\r\n`);
            resolve({ success: true, message: 'Correo enviado correctamente' });
          } else if (code >= 400) {
            sock.destroy();
            return reject(new Error(`Error del servidor SMTP (${code}): ${line}`));
          }
        }
      });

      sock.on('error', (err) => reject(err));
    }

    if (smtpPort === 465 || secure) {
      isTlsEstablished = true;
      const socket = tls.connect({
        host: smtpHost,
        port: smtpPort,
        timeout: 12000,
        rejectUnauthorized: false
      }, () => {
        handleDialog(socket);
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Tiempo de espera agotado al conectar al servidor SMTP ${smtpHost}:${smtpPort}`));
      });
      socket.on('error', (err) => reject(err));
    } else {
      const socket = net.connect({
        host: smtpHost,
        port: smtpPort,
        timeout: 12000
      }, () => {
        handleDialog(socket);
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Tiempo de espera agotado al conectar al servidor SMTP ${smtpHost}:${smtpPort}`));
      });
      socket.on('error', (err) => reject(err));
    }
  });
}

// Despacho unificado de resumen diario
async function dispatchDailyNotifications(triggerType = 'cron', targetChannel = null, customConfig = null) {
  const config = customConfig || readNotificationConfig();
  if (triggerType === 'cron' && !config.enabled) {
    return { skipped: true, reason: 'Notificaciones desactivadas en configuración' };
  }

  const campusData = readDataFromFile();
  const summary = compileTodaySummary(campusData);
  const channelToUse = targetChannel || config.channel || 'both';

  const results = {
    triggerType,
    channel: channelToUse,
    classroomsCount: summary.classroomsCount,
    email: null,
    telegram: null,
    timestamp: Date.now()
  };

  // 1. Telegram
  if (channelToUse === 'telegram' || channelToUse === 'both') {
    const { botToken, chatId } = config.telegram || {};
    if (botToken && chatId) {
      try {
        await sendTelegramMessage(botToken, chatId, summary.telegramText);
        results.telegram = { success: true, message: 'Mensaje enviado a Telegram' };
        console.log(`[Notificaciones] Resumen diario enviado a Telegram (${chatId}).`);
      } catch (err) {
        results.telegram = { success: false, error: err.message };
        console.error(`[Notificaciones] Error al enviar Telegram:`, err.message);
      }
    } else {
      results.telegram = { success: false, error: 'Telegram no configurado (falta botToken o chatId)' };
    }
  }

  // 2. Email
  if (channelToUse === 'email' || channelToUse === 'both') {
    const emailCfg = config.email || {};
    const recipient = emailCfg.to || emailCfg.user;
    if (emailCfg.user && emailCfg.pass && recipient) {
      try {
        await sendSmtpEmail({
          host: emailCfg.host,
          port: emailCfg.port,
          secure: emailCfg.secure !== false,
          user: emailCfg.user,
          pass: emailCfg.pass,
          to: recipient,
          subject: summary.emailSubject,
          htmlBody: summary.emailHtml
        });
        results.email = { success: true, message: `Correo enviado a ${recipient}` };
        console.log(`[Notificaciones] Resumen diario enviado por Correo a ${recipient}.`);
      } catch (err) {
        results.email = { success: false, error: err.message };
        console.error(`[Notificaciones] Error al enviar Correo:`, err.message);
      }
    } else {
      results.email = { success: false, error: 'Correo no configurado (falta usuario, contraseña de aplicación o destinatario)' };
    }
  }

  // Actualizar lastSentDate si fue disparo real
  if (triggerType === 'cron' || triggerType === 'send-now') {
    const todayIso = new Date().toISOString().split('T')[0];
    config.lastSentDate = todayIso;
    saveNotificationConfig(config);
  }

  return results;
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// Generador de PDF de bienvenida inicial válido
function getSamplePdfBuffer() {
  const content = `%PDF-1.4
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Resources <<
    /Font <<
      /F1 4 0 R
    >>
  >>
  /Contents 5 0 R
>>
endobj
4 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
>>
endobj
5 0 obj
<< /Length 380 >>
stream
BT
/F1 22 Tf
50 720 Td
(Mi Campus Personal - Biblioteca Local de PDFs) Tj
/F1 13 Tf
0 -40 Td
(Bienvenido a tu nueva Biblioteca de Documentos y Apuntes academicos.) Tj
0 -25 Td
(Organiza tus libros, guias de ejercicios, TPs y examenes anteriores.) Tj
0 -25 Td
(Puedes vincular cada documento con tus materias correspondientes.) Tj
0 -25 Td
(El visor integrado te permite estudiar y tomar notas en tiempo real.) Tj
/F1 11 Tf
0 -40 Td
(Sincronizado automaticamente en todos tus navegadores.) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000333 00000 n 
trailer
<<
  /Size 6
  /Root 1 0 R
>>
startxref
760
%%EOF`;
  return Buffer.from(content, 'utf-8');
}

// Initial default data structure if no file exists yet
function getInitialData() {
  const futureDate = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  return {
    userName: 'Estudiante',
    theme: 'dark',
    activeViewMode: 'subjects',
    quickNotes: '📌 Recordatorio rápido:\n- Las inscripciones a exámenes finales abren el próximo lunes.\n- Revisar entregas pendientes en el aula virtual del CFP 6 y de la UTN.',
    quickLinks: [
      { id: 'ql-1', title: 'Campus Virtual', url: 'https://campus.miuniversidad.edu.ar', icon: 'fa-building-columns' },
      { id: 'ql-2', title: 'Correo Institucional', url: 'https://mail.google.com', icon: 'fa-envelope' },
      { id: 'ql-3', title: 'Google Drive', url: 'https://drive.google.com', icon: 'fa-hard-drive' },
      { id: 'ql-4', title: 'Biblioteca Digital', url: 'https://biblioteca.unlp.edu.ar', icon: 'fa-book' },
      { id: 'ql-5', title: 'Calendario Académico', url: 'https://calendar.google.com', icon: 'fa-calendar-days' }
    ],
    institutions: [
      {
        id: 'inst-1',
        name: 'Universidad Tecnológica Nacional (UTN)',
        campusUrl: 'https://campus.frba.utn.edu.ar',
        portalUrl: 'https://guarani.frba.utn.edu.ar',
        icon: 'fa-building-columns',
        color: '#6366f1',
        notes: 'Usuario: Legajo UTN. DNI sin puntos. Soporte: campus@frba.utn.edu.ar',
        createdAt: Date.now() - 600000
      },
      {
        id: 'inst-2',
        name: 'Centro de Formación Profesional (CFP 6)',
        campusUrl: 'https://cfp6.educacion.gob.ar',
        portalUrl: 'https://cfp6.educacion.gob.ar/alumnos',
        icon: 'fa-school',
        color: '#10b981',
        notes: 'Horario de secretaría: 18:00 a 21:00 hs. Certificados digitales.',
        createdAt: Date.now() - 500000
      },
      {
        id: 'inst-3',
        name: 'Academia Digital & Cursos',
        campusUrl: 'https://classroom.google.com',
        portalUrl: 'https://drive.google.com',
        icon: 'fa-laptop-code',
        color: '#ec4899',
        notes: 'Talleres de capacitación profesional y diplomaturas online.',
        createdAt: Date.now() - 400000
      }
    ],
    classrooms: [
      {
        id: 'c-1',
        name: 'Programación Web Fullstack',
        institution: 'Centro de Formación Profesional (CFP 6)',
        career: 'Desarrollo de Software',
        platform: 'moodle',
        url: 'https://campus.miuniversidad.edu.ar/course/view.php?id=101',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        driveUrl: 'https://drive.google.com',
        schedule: 'Mar y Jue 18:30 - 21:30',
        teacher: 'Prof. Carlos Rossi (Com. 201)',
        color: '#6366f1',
        icon: 'fa-laptop-code',
        notes: 'Clave matriculación: FULLSTACK2026. Entrega de laboratorios los viernes.',
        createdAt: Date.now() - 500000
      },
      {
        id: 'c-2',
        name: 'Bases de Datos Relacionales y NoSQL',
        institution: 'Universidad Tecnológica Nacional (UTN)',
        career: 'Ingeniería en Sistemas',
        platform: 'classroom',
        url: 'https://classroom.google.com',
        meetingUrl: 'https://zoom.us/j/9876543210',
        driveUrl: 'https://drive.google.com',
        schedule: 'Miércoles 19:00 - 22:00',
        teacher: 'Dra. Elena Gómez',
        color: '#10b981',
        icon: 'fa-database',
        notes: 'Código de clase en Classroom: db-sql-2026. Servidor PostgreSQL en puerto 5432.',
        createdAt: Date.now() - 400000
      },
      {
        id: 'c-3',
        name: 'Álgebra Lineal y Geometría Analítica',
        institution: 'Universidad Tecnológica Nacional (UTN)',
        career: 'Ingeniería en Sistemas',
        platform: 'teams',
        url: 'https://teams.microsoft.com',
        meetingUrl: 'https://meet.google.com/xyz-uvwx-rst',
        driveUrl: '',
        schedule: 'Lunes y Viernes 16:00 - 18:00',
        teacher: 'Ing. Marcos Benítez',
        color: '#06b6d4',
        icon: 'fa-calculator',
        notes: 'Canal de Teams "Comisión A". Guía de ejercicios en carpeta de archivos.',
        createdAt: Date.now() - 300000
      },
      {
        id: 'c-4',
        name: 'Diseño UX/UI & Prototipado',
        institution: 'Academia Digital & Cursos',
        career: 'Diseño Multimedia',
        platform: 'canvas',
        url: 'https://canvas.instructure.com',
        meetingUrl: 'https://meet.google.com/des-uxui-2026',
        driveUrl: 'https://drive.google.com',
        schedule: 'Sábados 09:00 - 13:00',
        teacher: 'Lic. Sofía Albarracín',
        color: '#ec4899',
        icon: 'fa-palette',
        notes: 'Acceso a Figma con el correo institucional. Proyectos compartidos.',
        createdAt: Date.now() - 200000
      }
    ],
    reminders: [
      {
        id: 'r-1',
        title: 'Entrega TP 1: API REST con Autenticación',
        classroomId: 'c-1',
        priority: 'high',
        dueDate: futureDate(3),
        dueTime: '23:59',
        details: 'Subir repositorio de GitHub y documentación en PDF al aula virtual.',
        completed: false,
        createdAt: Date.now() - 100000
      },
      {
        id: 'r-2',
        title: 'Primer Parcial Teórico: Normalización de BD',
        classroomId: 'c-2',
        priority: 'high',
        dueDate: futureDate(7),
        dueTime: '19:00',
        details: 'Modalidad presencial, aula 204. Repasar 1FN, 2FN y 3FN.',
        completed: false,
        createdAt: Date.now() - 90000
      },
      {
        id: 'r-3',
        title: 'Lectura de matrices y determinantes (Capítulo 3)',
        classroomId: 'c-3',
        priority: 'low',
        dueDate: futureDate(1),
        dueTime: '18:00',
        details: 'Ejercicios pares del libro guía.',
        completed: false,
        createdAt: Date.now() - 80000
      },
      {
        id: 'r-4',
        title: 'Inscripción a finales de turno Julio',
        classroomId: '',
        priority: 'medium',
        dueDate: futureDate(10),
        dueTime: '20:00',
        details: 'Trámite desde el portal de alumnos SIU.',
        completed: true,
        createdAt: Date.now() - 70000
      }
    ],
    teachers: [
      {
        id: 't-1',
        name: 'Prof. Ezequiel Taboada',
        email: 'etaboada@bue.edu.ar',
        phone: '+54 9 11 4455-6677',
        institution: 'Centro de Formación Profesional (CFP 6)',
        subject: 'Programación con IA',
        officeHours: 'Jueves 17:30 a 18:30 hs',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
        color: '#6366f1',
        icon: 'fa-laptop-code',
        notes: 'Indicar en el asunto: [IA-CFP6]. Responder consultas con 48hs de anticipación.',
        createdAt: Date.now() - 500000
      },
      {
        id: 't-2',
        name: 'Prof. Carlos Rossi (Com. 201)',
        email: 'crossi@cfp6.educacion.gob.ar',
        phone: '',
        institution: 'Centro de Formación Profesional (CFP 6)',
        subject: 'Programación Web Fullstack',
        officeHours: 'Martes y Jueves 18:00 hs',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
        color: '#6366f1',
        icon: 'fa-chalkboard-user',
        notes: 'Consultas de proyectos prácticos con captura de pantalla y enlace al repositorio.',
        createdAt: Date.now() - 400000
      },
      {
        id: 't-3',
        name: 'Dra. Elena Gómez',
        email: 'egomez@frba.utn.edu.ar',
        phone: '+54 9 11 5566-7788',
        institution: 'Universidad Tecnológica Nacional (UTN)',
        subject: 'Bases de Datos Relacionales y NoSQL',
        officeHours: 'Miércoles 18:00 a 19:00 hs',
        meetUrl: 'https://zoom.us/j/9876543210',
        color: '#10b981',
        icon: 'fa-database',
        notes: 'Consultas de SQL y esquemas de BD antes de clase o vía correo institucional.',
        createdAt: Date.now() - 300000
      },
      {
        id: 't-4',
        name: 'Ing. Marcos Benítez',
        email: 'mbenitez@frba.utn.edu.ar',
        phone: '',
        institution: 'Universidad Tecnológica Nacional (UTN)',
        subject: 'Álgebra Lineal y Geometría Analítica',
        officeHours: 'Viernes 15:00 a 16:00 hs',
        meetUrl: 'https://meet.google.com/xyz-uvwx-rst',
        color: '#06b6d4',
        icon: 'fa-calculator',
        notes: 'Consultas de ejercicios prácticos de las guías de estudio.',
        createdAt: Date.now() - 200000
      }
    ],
    documents: [
      {
        id: 'doc-sample-1',
        title: 'Guía de Métodos y Consejos de Estudio Académico',
        classroomId: '',
        category: 'guia',
        author: 'Campus Personal',
        tags: 'Estudio, Productividad, Técnicas',
        readStatus: 'reading',
        isFavorite: true,
        fileSize: '1.2 KB',
        fileName: 'guia_consejos_estudio.pdf',
        notes: 'Técnicas Pomodoro, método Feynman y organización de horarios para exámenes.',
        createdAt: Date.now() - 300000,
        lastOpenedAt: Date.now()
      }
    ],
    lastUpdated: Date.now()
  };
}

// Ensure data directory, pdfs directory and files exist
function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  ensureAuthConfig();

  if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
  }

  // Create sample PDF file if missing
  const samplePdfPath = path.join(PDF_DIR, 'doc-sample-1.pdf');
  if (!fs.existsSync(samplePdfPath)) {
    try {
      fs.writeFileSync(samplePdfPath, getSamplePdfBuffer());
      console.log(`[Servidor] Archivo PDF de ejemplo creado en: ${samplePdfPath}`);
    } catch (e) {
      console.error('[Servidor] Error al crear PDF de ejemplo:', e);
    }
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initialData = getInitialData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    console.log(`[Servidor] Archivo de datos inicializado en: ${DATA_FILE}`);
  }
}

// Read data from file
function readDataFromFile() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.documents || data.documents.length === 0) {
      data.documents = [
        {
          id: 'doc-sample-1',
          title: 'Guía de Métodos y Consejos de Estudio Académico',
          classroomId: '',
          category: 'guia',
          author: 'Campus Personal',
          tags: 'Estudio, Productividad, Técnicas',
          readStatus: 'reading',
          isFavorite: true,
          fileSize: '1.2 KB',
          fileName: 'guia_consejos_estudio.pdf',
          notes: 'Técnicas Pomodoro, método Feynman y organización de horarios para exámenes.',
          createdAt: Date.now() - 300000,
          lastOpenedAt: Date.now()
        }
      ];
    }
    return data;
  } catch (err) {
    console.error('[Servidor] Error al leer data file:', err);
    // If corrupt, try to read from backup
    if (fs.existsSync(BACKUP_FILE)) {
      try {
        const backupRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
        const backupData = JSON.parse(backupRaw);
        if (!backupData.documents || backupData.documents.length === 0) {
          backupData.documents = [
            {
              id: 'doc-sample-1',
              title: 'Guía de Métodos y Consejos de Estudio Académico',
              classroomId: '',
              category: 'guia',
              author: 'Campus Personal',
              tags: 'Estudio, Productividad, Técnicas',
              readStatus: 'reading',
              isFavorite: true,
              fileSize: '1.2 KB',
              fileName: 'guia_consejos_estudio.pdf',
              notes: 'Técnicas Pomodoro, método Feynman y organización de horarios para exámenes.',
              createdAt: Date.now() - 300000,
              lastOpenedAt: Date.now()
            }
          ];
        }
        return backupData;
      } catch (e) {
        console.error('[Servidor] Error al leer archivo de respaldo:', e);
      }
    }
    return getInitialData();
  }
}

// Save data to file atomically
function saveDataToFile(data) {
  ensureDataFile();
  data.lastUpdated = Date.now();
  if (!data.documents) {
    data.documents = [];
  }
  const jsonString = JSON.stringify(data, null, 2);

  // Keep backup of current version if exists
  if (fs.existsSync(DATA_FILE)) {
    try {
      fs.copyFileSync(DATA_FILE, BACKUP_FILE);
    } catch (e) {
      // ignore backup copy error
    }
  }

  // Atomic write via temp file
  const tempFile = path.join(DATA_DIR, `campus_data.tmp.${Date.now()}`);
  fs.writeFileSync(tempFile, jsonString, 'utf-8');
  fs.renameSync(tempFile, DATA_FILE);

  return data;
}

// Active Server-Sent Events (SSE) connections
const sseClients = new Set();

function broadcastUpdate(data, originClientId = null) {
  const payload = JSON.stringify({
    type: 'DATA_SYNC',
    originClientId,
    lastUpdated: data.lastUpdated || Date.now(),
    data
  });

  for (const client of sseClients) {
    try {
      client.write(`event: data-updated\ndata: ${payload}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Handle CORS Headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-ID, Authorization, X-Auth-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// Create HTTP server
const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = urlObj.pathname;

  // --- API: Health / Status check ---
  if (pathname === '/api/status' && req.method === 'GET') {
    const authCfg = readAuthConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      version: '2.1.0',
      clientsConnected: sseClients.size,
      dataFile: DATA_FILE,
      pdfDir: PDF_DIR,
      auth: {
        enabled: !!authCfg.enabled,
        isSetup: !!authCfg.passwordHash,
        authenticated: isClientAuthenticated(req)
      },
      timestamp: Date.now()
    }));
    return;
  }

  // ==========================================
  // --- RUTAS DE AUTENTICACIÓN & SEGURIDAD ---
  // ==========================================

  // --- API: Estado de Autenticación ---
  if (pathname === '/api/auth/status' && req.method === 'GET') {
    const authCfg = readAuthConfig();
    const authenticated = isClientAuthenticated(req);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: !!authCfg.enabled,
      isSetup: !!authCfg.passwordHash,
      authenticated,
      version: '2.1.0'
    }));
    return;
  }

  // --- API: Primer Setup de Contraseña Maestra ---
  if (pathname === '/api/auth/setup' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const authCfg = readAuthConfig();

        if (authCfg.passwordHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La contraseña maestra ya fue configurada anteriormente.' }));
          return;
        }

        const password = String(payload.password || '').trim();
        if (!password || password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La contraseña debe tener al menos 4 caracteres.' }));
          return;
        }

        const { hash, salt } = hashPassword(password);
        authCfg.passwordHash = hash;
        authCfg.salt = salt;
        authCfg.enabled = true;

        // Crear sesión inmediata
        const rememberMe = !!payload.rememberMe;
        const maxAge = rememberMe ? 30 * 24 * 3600 : 24 * 3600; // 30 días o 1 día
        const token = crypto.randomBytes(32).toString('hex');
        const ip = getClientIp(req);

        authCfg.sessions[token] = {
          createdAt: Date.now(),
          expiresAt: Date.now() + maxAge * 1000,
          ip
        };

        saveAuthConfig(authCfg);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token, maxAge)
        });
        res.end(JSON.stringify({
          success: true,
          message: 'Contraseña configurada con éxito',
          token
        }));
      } catch (err) {
        console.error('[Auth Setup] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error al configurar contraseña', details: err.message }));
      }
    });
    return;
  }

  // --- API: Iniciar Sesión (Login) ---
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const ip = getClientIp(req);
        const rateCheck = checkRateLimit(ip);
        if (!rateCheck.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: `Demasiados intentos fallidos. Bloqueado temporalmente por ${rateCheck.minutesLeft} minuto(s).`
          }));
          return;
        }

        const payload = JSON.parse(body || '{}');
        const authCfg = readAuthConfig();

        if (!authCfg.passwordHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No se ha configurado ninguna contraseña aún.', requireSetup: true }));
          return;
        }

        const password = String(payload.password || '');
        const isValid = verifyPassword(password, authCfg.passwordHash, authCfg.salt);

        if (!isValid) {
          recordFailedAttempt(ip);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Contraseña incorrecta. Inténtalo de nuevo.' }));
          return;
        }

        // Login exitoso: limpiar intentos fallidos
        resetFailedAttempts(ip);

        const rememberMe = !!payload.rememberMe;
        const maxAge = rememberMe ? 30 * 24 * 3600 : 24 * 3600;
        const token = crypto.randomBytes(32).toString('hex');

        authCfg.sessions[token] = {
          createdAt: Date.now(),
          expiresAt: Date.now() + maxAge * 1000,
          ip
        };
        saveAuthConfig(authCfg);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token, maxAge)
        });
        res.end(JSON.stringify({
          success: true,
          message: 'Inicio de sesión correcto',
          token
        }));
      } catch (err) {
        console.error('[Auth Login] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error al procesar login', details: err.message }));
      }
    });
    return;
  }

  // --- API: Cerrar Sesión (Logout) ---
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = getSessionToken(req);
    const authCfg = readAuthConfig();
    if (token && authCfg.sessions[token]) {
      delete authCfg.sessions[token];
      saveAuthConfig(authCfg);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': buildClearSessionCookie()
    });
    res.end(JSON.stringify({ success: true, message: 'Sesión cerrada exitosamente' }));
    return;
  }

  // --- API: Cambiar Contraseña Maestra (Requiere autenticación) ---
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const authCfg = readAuthConfig();

        const currentPassword = String(payload.currentPassword || '');
        const newPassword = String(payload.newPassword || '').trim();

        if (authCfg.passwordHash) {
          const isValid = verifyPassword(currentPassword, authCfg.passwordHash, authCfg.salt);
          if (!isValid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'La contraseña actual no es correcta.' }));
            return;
          }
        }

        if (!newPassword || newPassword.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La nueva contraseña debe tener al menos 4 caracteres.' }));
          return;
        }

        const { hash, salt } = hashPassword(newPassword);
        authCfg.passwordHash = hash;
        authCfg.salt = salt;
        saveAuthConfig(authCfg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contraseña actualizada correctamente.' }));
      } catch (err) {
        console.error('[Auth Change Password] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error al cambiar contraseña', details: err.message }));
      }
    });
    return;
  }

  // --- API: Alternar Requerimiento de Contraseña (Toggle On/Off) ---
  if (pathname === '/api/auth/toggle' && req.method === 'POST') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const authCfg = readAuthConfig();
        const enable = !!payload.enabled;

        // Si se va a desactivar, verificar contraseña actual si existe
        if (!enable && authCfg.passwordHash) {
          const currentPassword = String(payload.currentPassword || '');
          const isValid = verifyPassword(currentPassword, authCfg.passwordHash, authCfg.salt);
          if (!isValid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Contraseña actual incorrecta para desactivar la seguridad.' }));
            return;
          }
        }

        authCfg.enabled = enable;
        saveAuthConfig(authCfg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          enabled: authCfg.enabled,
          message: enable ? 'Protección con contraseña activada' : 'Protección con contraseña desactivada'
        }));
      } catch (err) {
        console.error('[Auth Toggle] Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error al modificar seguridad', details: err.message }));
      }
    });
    return;
  }

  // ==========================================
  // --- RUTAS PROTEGIDAS POR AUTENTICACIÓN ---
  // ==========================================

  // --- API: Get all shared data ---
  if (pathname === '/api/data' && req.method === 'GET') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }
    const data = readDataFromFile();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // --- API: Save / Update shared data ---
  if (pathname === '/api/data' && (req.method === 'POST' || req.method === 'PUT')) {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB protection limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload demasiado grande' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const incomingData = JSON.parse(body);
        const clientId = req.headers['x-client-id'] || null;
        const savedData = saveDataToFile(incomingData);
        
        // Notify all other connected browsers / tabs in real time
        broadcastUpdate(savedData, clientId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, lastUpdated: savedData.lastUpdated }));
      } catch (err) {
        console.error('[Servidor] Error al procesar guardado de datos:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON inválido o error al guardar', details: err.message }));
      }
    });
    return;
  }

  // --- API: Subir Archivo PDF ---
  if (pathname === '/api/pdfs/upload' && req.method === 'POST') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 100 * 1024 * 1024) { // 100MB limit for PDFs
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'El archivo PDF excede el límite de 100MB' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const docId = payload.id || `doc-${Date.now()}`;
        const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = path.join(PDF_DIR, `${safeDocId}.pdf`);

        let fileBuffer;
        if (payload.base64) {
          const base64Data = payload.base64.replace(/^data:application\/pdf;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
          fileBuffer = Buffer.from(base64Data, 'base64');
        } else if (payload.data) {
          fileBuffer = Buffer.from(payload.data);
        } else {
          throw new Error('No se recibió información binaria o base64 del archivo PDF');
        }

        fs.writeFileSync(filePath, fileBuffer);
        console.log(`[Servidor] Archivo PDF guardado exitosamente: ${filePath} (${fileBuffer.length} bytes)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          id: safeDocId,
          fileName: payload.fileName || `${safeDocId}.pdf`,
          fileSize: fileBuffer.length,
          fileUrl: `/api/pdfs/file/${safeDocId}`
        }));
      } catch (err) {
        console.error('[Servidor] Error al subir PDF:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error al procesar subida de PDF', details: err.message }));
      }
    });
    return;
  }

  // --- API: Visualizar / Descargar Archivo PDF ---
  if (pathname.startsWith('/api/pdfs/file/') && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado para acceder a este archivo PDF', requireAuth: true }));
      return;
    }

    const rawId = pathname.replace('/api/pdfs/file/', '').split('/')[0].split('?')[0];
    const safeDocId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(PDF_DIR, `${safeDocId}.pdf`);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Documento PDF no encontrado en el servidor' }));
      return;
    }

    try {
      const stats = fs.statSync(filePath);
      const isDownload = urlObj.searchParams.get('download') === '1';
      const downloadName = urlObj.searchParams.get('name') || `${safeDocId}.pdf`;
      const safeDownloadName = encodeURIComponent(downloadName);

      const headers = {
        'Content-Type': 'application/pdf',
        'Content-Length': stats.size,
        'Content-Disposition': isDownload ? `attachment; filename="${safeDownloadName}"; filename*=UTF-8''${safeDownloadName}` : `inline; filename="${safeDownloadName}"`,
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes'
      };

      // Range support for fast streaming/previewing pages
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Content-Length': chunksize
        });

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
        return;
      }

      res.writeHead(200, headers);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      console.error('[Servidor] Error al servir PDF:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error al leer el archivo PDF' }));
    }
    return;
  }

  // --- API: Eliminar Archivo PDF del Disco ---
  if (pathname.startsWith('/api/pdfs/') && req.method === 'DELETE') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    const rawId = pathname.replace('/api/pdfs/', '').split('/')[0].split('?')[0];
    const safeDocId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(PDF_DIR, `${safeDocId}.pdf`);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[Servidor] Archivo PDF eliminado: ${filePath}`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, id: safeDocId }));
    } catch (err) {
      console.error('[Servidor] Error al borrar PDF:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error al eliminar archivo PDF', details: err.message }));
    }
    return;
  }

  // --- API: Server-Sent Events (SSE) for Real-Time Multi-Browser Sync ---
  if (pathname === '/api/events' && req.method === 'GET') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado para suscribirse a eventos de sincronización', requireAuth: true }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado al servidor de sincronización', clientId: Date.now() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // --- API: Obtener Configuración de Notificaciones ---
  if (pathname === '/api/notifications/config' && req.method === 'GET') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }
    const config = readNotificationConfig();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(config));
    return;
  }

  // --- API: Guardar Configuración de Notificaciones ---
  if (pathname === '/api/notifications/config' && (req.method === 'POST' || req.method === 'PUT')) {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const incomingConfig = JSON.parse(body);
        const current = readNotificationConfig();
        const merged = {
          ...current,
          ...incomingConfig,
          email: { ...current.email, ...(incomingConfig.email || {}) },
          telegram: { ...current.telegram, ...(incomingConfig.telegram || {}) }
        };
        saveNotificationConfig(merged);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, config: merged }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Configuración inválida', details: err.message }));
      }
    });
    return;
  }

  // --- API: Probar Envío de Notificaciones (Email, Telegram o Ambos) ---
  if (pathname === '/api/notifications/test' && req.method === 'POST') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let payload = {};
        if (body) {
          payload = JSON.parse(body);
        }
        const targetChannel = payload.channel || null; // 'email' | 'telegram' | 'both'
        const customConfig = payload.config || null;

        const results = await dispatchDailyNotifications('test', targetChannel, customConfig);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results }));
      } catch (err) {
        console.error('[API Notificaciones] Error en test:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- API: Forzar Envío Inmediato de Resumen de Hoy ---
  if (pathname === '/api/notifications/send-now' && req.method === 'POST') {
    if (!isClientAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Se requiere iniciar sesión.', requireAuth: true }));
      return;
    }

    (async () => {
      try {
        const results = await dispatchDailyNotifications('send-now');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }

  // --- Static Files Serving ---
  if (req.method === 'GET' || req.method === 'HEAD') {
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    const filePath = path.join(__dirname, safePath);

    // Security check: ensure filePath is inside __dirname
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Acceso denegado');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404 - Archivo no encontrado</h1><p><a href="/">Volver al Inicio</a></p>`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache'
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    });
    return;
  }

  // Default fallback for unhandled requests
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Método no permitido');
});

// Initialize storage, notifications and start server
ensureDataFile();

// Scheduler de notificaciones diarias (verifica cada minuto)
setInterval(() => {
  try {
    const config = readNotificationConfig();
    if (!config.enabled) return;

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const todayIso = now.toISOString().split('T')[0];

    const targetTime = config.time || '07:00';

    if (currentTimeStr === targetTime && config.lastSentDate !== todayIso) {
      console.log(`[Scheduler] Disparando envío matutino automático programado (${currentTimeStr})...`);
      dispatchDailyNotifications('cron');
    }
  } catch (e) {
    console.error('[Scheduler] Error en ciclo de verificación:', e);
  }
}, 60000);

server.on('error', (err) => {
  console.error('[Servidor HTTP] Error en el servidor:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[Servidor] Excepción no capturada:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Servidor] Promesa rechazada no manejada:', reason);
});

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`🎓 MI CAMPUS PERSONAL - SERVIDOR MULTI-NAVEGADOR`);
  console.log(`📡 URL / Host:       http://${HOST}:${PORT}`);
  console.log(`💾 Base de Datos:    ${DATA_FILE}`);
  console.log(`📚 Biblioteca PDFs:  ${PDF_DIR}`);
  console.log(`🔔 Notificaciones:   ${NOTIF_CONFIG_FILE}`);
  console.log(`🔐 Autenticación:   ${AUTH_CONFIG_FILE}`);
  console.log(`⚡ Sincronización en vivo activada para todos tus navegadores.`);
  console.log('====================================================');
});


