/**
 * Script standalone para enviar el resumen matutino de materias
 * Diseñado para ejecutarse desde el Programador de Tareas de Windows (Task Scheduler) o consola:
 * node scripts/send_daily_summary.js
 */

const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'campus_data.json');
const NOTIF_CONFIG_FILE = path.join(DATA_DIR, 'notifications_config.json');

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

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error al leer campus_data.json:', e);
  }
  return { classrooms: [], reminders: [], userName: 'Estudiante' };
}

function readConfig() {
  try {
    if (fs.existsSync(NOTIF_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIF_CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error al leer notifications_config.json:', e);
  }
  return { enabled: true, channel: 'both' };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(NOTIF_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Error al guardar notifications_config.json:', e);
  }
}

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

  // Telegram Text
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

  // Email HTML
  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #1e293b;">
      <div style="max-width: 650px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; padding: 24px; text-align: left;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800;">🎓 Resumen Matutino &bull; ${escapeHtml(dayName)}</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">¡Buen día, <strong>${escapeHtml(userName)}</strong>! Aquí tienes tu agenda para hoy (${escapeHtml(dateFormatted)})</p>
        </div>

        <div style="padding: 24px;">
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
            Enviado automáticamente por <strong>Mi Campus Personal</strong>.
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

function sendTelegram(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 10000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.ok) resolve(j);
          else reject(new Error(j.description || 'Error de Telegram'));
        } catch (e) {
          reject(new Error(data));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout con Telegram')); });
    req.write(payload);
    req.end();
  });
}

function sendEmail({ host, port, secure, user, pass, to, subject, htmlBody }) {
  return new Promise((resolve, reject) => {
    const smtpHost = host || (user.endsWith('@gmail.com') ? 'smtp.gmail.com' : 'smtp.office365.com');
    const smtpPort = port ? parseInt(port, 10) : (secure ? 465 : 587);
    const cleanPass = pass.replace(/\s+/g, '');

    const boundary = '----=_Part_' + Date.now().toString(36);
    const mime = [
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

    let isTls = false;

    function handleDialog(sock) {
      let state = 'INIT';
      let buffer = '';

      sock.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\r\n');
        buffer = lines.pop();

        for (const line of lines) {
          const code = parseInt(line.substring(0, 3), 10);
          if (isNaN(code) || line.charAt(3) === '-') continue;

          if (state === 'INIT' && code === 220) {
            state = 'HELO';
            sock.write(`EHLO localhost\r\n`);
          } else if (state === 'HELO' && code === 250) {
            if (!isTls && (smtpPort === 587 || smtpPort === 25)) {
              state = 'STARTTLS';
              sock.write(`STARTTLS\r\n`);
            } else {
              state = 'AUTH';
              sock.write(`AUTH LOGIN\r\n`);
            }
          } else if (state === 'STARTTLS' && code === 220) {
            isTls = true;
            const tlsSocket = tls.connect({ socket: sock, host: smtpHost, rejectUnauthorized: false }, () => {
              handleDialog(tlsSocket);
              tlsSocket.write(`EHLO localhost\r\n`);
            });
            tlsSocket.on('error', reject);
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
            sock.write(`${mime}\r\n.\r\n`);
          } else if (state === 'BODY' && code === 250) {
            state = 'QUIT';
            sock.write(`QUIT\r\n`);
            resolve({ success: true });
          } else if (code >= 400) {
            sock.destroy();
            return reject(new Error(`SMTP error (${code}): ${line}`));
          }
        }
      });
      sock.on('error', reject);
    }

    if (smtpPort === 465 || secure) {
      isTls = true;
      const sock = tls.connect({ host: smtpHost, port: smtpPort, timeout: 12000, rejectUnauthorized: false }, () => {
        handleDialog(sock);
      });
      sock.on('timeout', () => { sock.destroy(); reject(new Error('Timeout SMTP')); });
      sock.on('error', reject);
    } else {
      const sock = net.connect({ host: smtpHost, port: smtpPort, timeout: 12000 }, () => {
        handleDialog(sock);
      });
      sock.on('timeout', () => { sock.destroy(); reject(new Error('Timeout SMTP')); });
      sock.on('error', reject);
    }
  });
}

// Ejecución principal
async function run() {
  console.log('====================================================');
  console.log('🔔 MI CAMPUS PERSONAL - ENVIADOR DE RESUMEN DIARIO');
  console.log('====================================================');

  const config = readConfig();
  const campusData = readData();
  const summary = compileTodaySummary(campusData);

  console.log(`📅 Día: ${summary.dayName} (${summary.dateFormatted})`);
  console.log(`📚 Clases para hoy: ${summary.classroomsCount}`);

  const channel = config.channel || 'both';
  let emailOk = false;
  let telegramOk = false;

  if (channel === 'telegram' || channel === 'both') {
    if (config.telegram && config.telegram.botToken && config.telegram.chatId) {
      try {
        console.log('📡 Enviando mensaje a Telegram...');
        await sendTelegram(config.telegram.botToken, config.telegram.chatId, summary.telegramText);
        console.log('✅ Resumen enviado a Telegram correctamente.');
        telegramOk = true;
      } catch (err) {
        console.error('❌ Error enviando a Telegram:', err.message);
      }
    } else {
      console.log('⚠️ Telegram no configurado en notifications_config.json');
    }
  }

  if (channel === 'email' || channel === 'both') {
    const e = config.email || {};
    const recipient = e.to || e.user;
    if (e.user && e.pass && recipient) {
      try {
        console.log(`✉️ Enviando correo a ${recipient}...`);
        await sendEmail({
          host: e.host,
          port: e.port,
          secure: e.secure !== false,
          user: e.user,
          pass: e.pass,
          to: recipient,
          subject: summary.emailSubject,
          htmlBody: summary.emailHtml
        });
        console.log(`✅ Resumen enviado por Correo correctamente.`);
        emailOk = true;
      } catch (err) {
        console.error('❌ Error enviando Correo:', err.message);
      }
    } else {
      console.log('⚠️ Correo no configurado en notifications_config.json');
    }
  }

  if (emailOk || telegramOk) {
    config.lastSentDate = new Date().toISOString().split('T')[0];
    saveConfig(config);
    console.log('💾 Registro de último envío actualizado.');
  }

  console.log('🏁 Proceso finalizado.');
}

run().catch(console.error);
