/**
 * ==========================================================================
 * MI CAMPUS PERSONAL - HOMEPAGE ACADÉMICA
 * Lógica modular con Switch: Vista por Materia / Vista por Institución
 * ==========================================================================
 */

// --- Estado Global y Configuración de Almacenamiento & Sincronización ---
const STORAGE_KEY = 'academic_homepage_data_v2';
const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

// Detección dinámica de la API del servidor (Local, Red local o Nube / Alwaysdata)
function getApiBaseUrl() {
  if (window.location.protocol.startsWith('http')) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

const API_BASE_URL = getApiBaseUrl();
let isServerConnected = false;
let sseEventSource = null;
let isSavingRemote = false;
let isUpdatingFromRemote = false;

// --- Estado de Autenticación & Seguridad ---
let authStatus = {
  enabled: true,
  isSetup: true,
  authenticated: false
};

function getAuthHeaders(extraHeaders = {}) {
  const token = localStorage.getItem('campus_auth_token') || sessionStorage.getItem('campus_auth_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Auth-Token'] = token;
  }
  return headers;
}

function saveSessionToken(token, rememberMe) {
  if (rememberMe) {
    localStorage.setItem('campus_auth_token', token);
  } else {
    sessionStorage.setItem('campus_auth_token', token);
    localStorage.removeItem('campus_auth_token');
  }
}

function clearSessionToken() {
  localStorage.removeItem('campus_auth_token');
  sessionStorage.removeItem('campus_auth_token');
}

async function checkAuthStatus() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/status`, {
      headers: getAuthHeaders({ 'Accept': 'application/json' })
    });
    if (res.ok) {
      const data = await res.json();
      authStatus = { ...authStatus, ...data };
      return authStatus;
    }
  } catch (err) {
    console.warn('[Auth] No se pudo verificar el estado de autenticación:', err.message);
  }
  return { enabled: false, isSetup: true, authenticated: true };
}

function showAuthScreen(mode = 'login') {
  const overlay = document.getElementById('authOverlay');
  const loginForm = document.getElementById('loginForm');
  const setupForm = document.getElementById('setupForm');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  const authAlert = document.getElementById('authAlert');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!overlay) return;

  if (authAlert) authAlert.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'none';
  overlay.classList.remove('auth-fade-out');
  overlay.style.display = 'flex';

  if (mode === 'setup') {
    if (loginForm) loginForm.style.display = 'none';
    if (setupForm) setupForm.style.display = 'block';
    if (authTitle) authTitle.textContent = 'Crear Contraseña Maestra';
    if (authSubtitle) authSubtitle.textContent = 'Configura tu contraseña para proteger tus datos al alojar en la nube';
    setTimeout(() => document.getElementById('setupPasswordInput')?.focus(), 150);
  } else {
    if (setupForm) setupForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    if (authTitle) authTitle.textContent = 'Mi Campus Personal';
    if (authSubtitle) authSubtitle.textContent = 'Ingresa tu contraseña para acceder a tus aulas, recordatorios y notas';
    setTimeout(() => document.getElementById('loginPasswordInput')?.focus(), 150);
  }
}

function hideAuthScreen() {
  const overlay = document.getElementById('authOverlay');
  const logoutBtn = document.getElementById('logoutBtn');
  if (overlay) {
    overlay.classList.add('auth-fade-out');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 350);
  }
  if (logoutBtn && authStatus.enabled) {
    logoutBtn.style.display = 'inline-flex';
  }
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const passInput = document.getElementById('loginPasswordInput');
  const rememberMe = document.getElementById('loginRememberMe')?.checked ?? true;
  const alertBox = document.getElementById('authAlert');
  const alertText = document.getElementById('authAlertText');
  const submitBtn = document.getElementById('loginSubmitBtn');
  const authCard = document.querySelector('.auth-card');

  const password = passInput ? passInput.value : '';
  if (!password) {
    if (alertText) alertText.textContent = 'Por favor, ingresa tu contraseña.';
    if (alertBox) alertBox.style.display = 'flex';
    return;
  }

  if (submitBtn) {
    submitBtn.querySelector('.btn-text').style.display = 'none';
    submitBtn.querySelector('.btn-spinner').style.display = 'inline-flex';
    submitBtn.disabled = true;
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, rememberMe })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (data.token) {
        saveSessionToken(data.token, rememberMe);
      }
      authStatus.authenticated = true;
      hideAuthScreen();
      if (passInput) passInput.value = '';
      showToast('¡Bienvenido! Sesión iniciada correctamente', 'success');
      loadData();
    } else {
      const errorMsg = data.error || 'Contraseña incorrecta';
      if (alertText) alertText.textContent = errorMsg;
      if (alertBox) alertBox.style.display = 'flex';
      if (authCard) {
        authCard.classList.add('auth-shake');
        setTimeout(() => authCard.classList.remove('auth-shake'), 500);
      }
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
  } catch (err) {
    if (alertText) alertText.textContent = 'Error de conexión con el servidor. Inténtalo de nuevo.';
    if (alertBox) alertBox.style.display = 'flex';
  } finally {
    if (submitBtn) {
      submitBtn.querySelector('.btn-text').style.display = 'inline-flex';
      submitBtn.querySelector('.btn-spinner').style.display = 'none';
      submitBtn.disabled = false;
    }
  }
}

async function handleSetupSubmit(e) {
  if (e) e.preventDefault();
  const passInput = document.getElementById('setupPasswordInput');
  const confirmInput = document.getElementById('setupPasswordConfirmInput');
  const rememberMe = document.getElementById('setupRememberMe')?.checked ?? true;
  const alertBox = document.getElementById('authAlert');
  const alertText = document.getElementById('authAlertText');
  const submitBtn = document.getElementById('setupSubmitBtn');
  const authCard = document.querySelector('.auth-card');

  const password = passInput ? passInput.value.trim() : '';
  const confirmPass = confirmInput ? confirmInput.value.trim() : '';

  if (!password || password.length < 4) {
    if (alertText) alertText.textContent = 'La contraseña debe tener al menos 4 caracteres.';
    if (alertBox) alertBox.style.display = 'flex';
    return;
  }

  if (password !== confirmPass) {
    if (alertText) alertText.textContent = 'Las contraseñas no coinciden.';
    if (alertBox) alertBox.style.display = 'flex';
    if (authCard) {
      authCard.classList.add('auth-shake');
      setTimeout(() => authCard.classList.remove('auth-shake'), 500);
    }
    return;
  }

  if (submitBtn) {
    submitBtn.querySelector('.btn-text').style.display = 'none';
    submitBtn.querySelector('.btn-spinner').style.display = 'inline-flex';
    submitBtn.disabled = true;
  }
  if (alertBox) alertBox.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, rememberMe })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (data.token) {
        saveSessionToken(data.token, rememberMe);
      }
      authStatus.isSetup = true;
      authStatus.authenticated = true;
      hideAuthScreen();
      showToast('¡Contraseña maestra configurada con éxito!', 'success');
      loadData();
    } else {
      if (alertText) alertText.textContent = data.error || 'Error al configurar contraseña';
      if (alertBox) alertBox.style.display = 'flex';
    }
  } catch (err) {
    if (alertText) alertText.textContent = 'Error de conexión con el servidor.';
    if (alertBox) alertBox.style.display = 'flex';
  } finally {
    if (submitBtn) {
      submitBtn.querySelector('.btn-text').style.display = 'inline-flex';
      submitBtn.querySelector('.btn-spinner').style.display = 'none';
      submitBtn.disabled = false;
    }
  }
}

async function handleLogout() {
  if (confirm('¿Deseas cerrar tu sesión segura en este navegador?')) {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' })
      });
    } catch (e) {}

    clearSessionToken();
    if (sseEventSource) {
      sseEventSource.close();
      sseEventSource = null;
    }
    authStatus.authenticated = false;
    showAuthScreen('login');
    showToast('Sesión cerrada correctamente', 'info');
  }
}

async function handleChangePasswordSubmit() {
  const currentPassInput = document.getElementById('currentPasswordInput');
  const newPassInput = document.getElementById('newPasswordInput');
  const confirmNewPassInput = document.getElementById('confirmNewPasswordInput');

  const currentPassword = currentPassInput ? currentPassInput.value : '';
  const newPassword = newPassInput ? newPassInput.value.trim() : '';
  const confirmNewPass = confirmNewPassInput ? confirmNewPassInput.value.trim() : '';

  if (!newPassword || newPassword.length < 4) {
    showToast('La nueva contraseña debe tener al menos 4 caracteres', 'error');
    return;
  }

  if (newPassword !== confirmNewPass) {
    showToast('Las contraseñas nuevas no coinciden', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('¡Contraseña maestra actualizada correctamente!', 'success');
      if (currentPassInput) currentPassInput.value = '';
      if (newPassInput) newPassInput.value = '';
      if (confirmNewPassInput) confirmNewPassInput.value = '';
      const formContainer = document.getElementById('changePasswordFormContainer');
      if (formContainer) formContainer.style.display = 'none';
    } else {
      showToast(data.error || 'Error al cambiar contraseña', 'error');
    }
  } catch (err) {
    showToast('Error de conexión al cambiar contraseña', 'error');
  }
}

async function handleToggleAuthRequirement(e) {
  const targetEnabled = e.target.checked;
  let currentPassword = '';

  if (!targetEnabled && authStatus.isSetup) {
    const entered = prompt('Ingresa tu contraseña actual para desactivar la seguridad:');
    if (!entered) {
      e.target.checked = true;
      return;
    }
    currentPassword = entered;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/toggle`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled: targetEnabled, currentPassword })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      authStatus.enabled = data.enabled;
      updateSecuritySettingsUI();
      showToast(data.message, 'success');
    } else {
      e.target.checked = !targetEnabled;
      showToast(data.error || 'Error al modificar configuración', 'error');
    }
  } catch (err) {
    e.target.checked = !targetEnabled;
    showToast('Error de conexión con el servidor', 'error');
  }
}

function updateSecuritySettingsUI() {
  const badge = document.getElementById('settingsAuthStatusBadge');
  const toggle = document.getElementById('authEnabledToggle');
  const logoutBtn = document.getElementById('logoutBtn');

  if (toggle) toggle.checked = !!authStatus.enabled;
  if (badge) {
    if (authStatus.enabled) {
      badge.textContent = 'Protegido';
      badge.className = 'badge badge-success';
    } else {
      badge.textContent = 'Sin Contraseña';
      badge.className = 'badge';
    }
  }
  if (logoutBtn) {
    logoutBtn.style.display = authStatus.enabled && authStatus.authenticated ? 'inline-flex' : 'none';
  }
}

function initAuthEventListeners() {
  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('setupForm')?.addEventListener('submit', handleSetupSubmit);
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

  // Toggle password visibility
  document.getElementById('toggleLoginPassBtn')?.addEventListener('click', () => {
    togglePasswordInput('loginPasswordInput', 'toggleLoginPassBtn');
  });
  document.getElementById('toggleSetupPassBtn')?.addEventListener('click', () => {
    togglePasswordInput('setupPasswordInput', 'toggleSetupPassBtn');
  });
  document.getElementById('toggleSetupPassConfirmBtn')?.addEventListener('click', () => {
    togglePasswordInput('setupPasswordConfirmInput', 'toggleSetupPassConfirmBtn');
  });

  // Settings Change Password
  document.getElementById('toggleChangePassSectionBtn')?.addEventListener('click', () => {
    const container = document.getElementById('changePasswordFormContainer');
    if (container) {
      const isHidden = container.style.display === 'none' || !container.style.display;
      container.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        document.getElementById('currentPasswordInput')?.focus();
      }
    }
  });

  document.getElementById('submitChangePassBtn')?.addEventListener('click', handleChangePasswordSubmit);
  document.getElementById('cancelChangePassBtn')?.addEventListener('click', () => {
    const container = document.getElementById('changePasswordFormContainer');
    if (container) container.style.display = 'none';
  });

  document.getElementById('authEnabledToggle')?.addEventListener('change', handleToggleAuthRequirement);

  // Generic data-target toggles
  document.querySelectorAll('.btn-toggle-password[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (targetId) togglePasswordInput(targetId, btn);
    });
  });
}

function togglePasswordInput(inputId, btnOrBtnId) {
  const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
  const btn = typeof btnOrBtnId === 'string' ? document.getElementById(btnOrBtnId) : btnOrBtnId;
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
  }
}

const DEFAULT_SAMPLE_DATA = {
  userName: 'Estudiante',
  theme: 'dark',
  activeViewMode: 'subjects', // 'subjects' | 'institutions'
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
      dueDate: getFutureDateString(3),
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
      dueDate: getFutureDateString(7),
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
      dueDate: getFutureDateString(1),
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
      dueDate: getFutureDateString(10),
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
  ]
};

// Helper para generar fechas de ejemplo
function getFutureDateString(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().split('T')[0];
}

// Objeto de estado en memoria
let appData = {
  userName: '',
  theme: 'dark',
  activeViewMode: 'subjects',
  quickNotes: '',
  quickLinks: [],
  institutions: [],
  classrooms: [],
  reminders: [],
  teachers: [],
  documents: []
};

// Días de la Semana y Configuración de Filtrado
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
  const dayIndex = new Date().getDay(); // 0 = domingo, 1 = lunes, ...
  const found = DAYS_OF_WEEK.find(d => d.dayIndex === dayIndex);
  return found ? found.key : 'lunes';
}

// Analizador inteligente de días desde el texto de horario (Lun y Mié, Martes 8:40, Lunes a Viernes, etc.)
function parseDaysFromSchedule(scheduleText) {
  if (!scheduleText || typeof scheduleText !== 'string') return [];
  
  // Normalizar eliminando acentos y pasando a minúsculas
  const norm = scheduleText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const detected = new Set();

  // Rangos comunes en español:
  // "Lunes a Viernes" / "Lun a Vie"
  if (/\b(lunes|lun|lu)\s*(?:a|al|-)\s*(viernes|vie|vi)\b/.test(norm)) {
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].forEach(d => detected.add(d));
  }
  // "Lunes a Jueves" / "Lun a Jue"
  else if (/\b(lunes|lun|lu)\s*(?:a|al|-)\s*(jueves|jue|ju)\b/.test(norm)) {
    ['lunes', 'martes', 'miercoles', 'jueves'].forEach(d => detected.add(d));
  }
  // "Lunes a Miercoles"
  else if (/\b(lunes|lun|lu)\s*(?:a|al|-)\s*(miercoles|mier|mie|mi)\b/.test(norm)) {
    ['lunes', 'martes', 'miercoles'].forEach(d => detected.add(d));
  }
  // "Martes a Jueves"
  else if (/\b(martes|mar|ma)\s*(?:a|al|-)\s*(jueves|jue|ju)\b/.test(norm)) {
    ['martes', 'miercoles', 'jueves'].forEach(d => detected.add(d));
  }
  // "Martes a Viernes"
  else if (/\b(martes|mar|ma)\s*(?:a|al|-)\s*(viernes|vie|vi)\b/.test(norm)) {
    ['martes', 'miercoles', 'jueves', 'viernes'].forEach(d => detected.add(d));
  }

  // Detección individual de días con límites de palabra
  if (/\b(lunes|lun|lu)\b/.test(norm)) detected.add('lunes');
  if (/\b(martes|mar|ma)\b/.test(norm)) detected.add('martes');
  if (/\b(miercoles|mier|mie|mi)\b/.test(norm)) detected.add('miercoles');
  if (/\b(jueves|juev|jue|ju)\b/.test(norm)) detected.add('jueves');
  if (/\b(viernes|vier|vie|vi)\b/.test(norm)) detected.add('viernes');
  if (/\b(sabados?|sab|sa)\b/.test(norm)) detected.add('sabado');
  if (/\b(domingos?|dom|do)\b/.test(norm)) detected.add('domingo');

  // Retornar en orden cronológico semanal
  return DAYS_OF_WEEK.map(d => d.key).filter(k => detected.has(k));
}

// Filtros de UI
let activeCareerFilter = 'ALL';
let activeDayFilter = 'ALL';
let activeReminderFilter = 'pending';
let activePdfCategoryFilter = 'ALL';
let activePdfStatusFilter = 'ALL';
let currentSearchQuery = '';
let currentReadingDocId = null;
let readerNotesDebounceTimer = null;

// --- Almacenamiento Local de Archivos PDF (IndexedDB para funcionamiento 100% Offline) ---
const PDF_DB_NAME = 'CampusPdfLocalStore';
const PDF_DB_VERSION = 1;
const PDF_STORE_NAME = 'pdf_files';

function openPdfDatabase() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(PDF_DB_NAME, PDF_DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
        db.createObjectStore(PDF_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => {
      console.warn('[IndexedDB] Error al abrir DB de PDFs:', e);
      resolve(null);
    };
  });
}

async function savePdfToIndexedDb(id, fileData, fileName, fileSize) {
  try {
    const db = await openPdfDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PDF_STORE_NAME);
      store.put({
        id,
        fileData, // base64 string
        fileName,
        fileSize,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error guardando PDF offline:', err);
    return false;
  }
}

async function getPdfFromIndexedDb(id) {
  try {
    const db = await openPdfDatabase();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE_NAME, 'readonly');
      const store = tx.objectStore(PDF_STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error recuperando PDF offline:', err);
    return null;
  }
}

async function deletePdfFromIndexedDb(id) {
  try {
    const db = await openPdfDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PDF_STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error eliminando PDF offline:', err);
    return false;
  }
}

// Helper para convertir Base64 a Blob Object URL
function base64ToBlobUrl(base64Data, contentType = 'application/pdf') {
  try {
    const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '').replace(/^data:application\/octet-stream;base64,/, '');
    const byteCharacters = atob(cleanBase64);
    const byteArrays = [];
    const sliceSize = 512;

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }

    const blob = new Blob(byteArrays, { type: contentType });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('[Blob] Error convirtiendo base64 a URL de Blob:', err);
    return '';
  }
}

// --- Inicialización de la Aplicación ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initClockAndDate();
  initEventListeners();
  initAuthEventListeners();

  // Comprobar estado de seguridad y login
  const status = await checkAuthStatus();
  if (status.enabled) {
    if (!status.isSetup) {
      showAuthScreen('setup');
    } else if (!status.authenticated) {
      showAuthScreen('login');
    } else {
      hideAuthScreen();
      loadData();
      renderAll();
    }
  } else {
    hideAuthScreen();
    loadData();
    renderAll();
  }
});

// --- Manejo de Almacenamiento y Sincronización (Híbrido: LocalStorage + Servidor Central) ---
function loadData() {
  // 1. Carga inmediata desde localStorage para evitar parpadeos visuales
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appData = { ...DEFAULT_SAMPLE_DATA, ...parsed };
      if (!appData.institutions || appData.institutions.length === 0) {
        appData.institutions = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.institutions));
      }
      if (!appData.teachers || appData.teachers.length === 0) {
        appData.teachers = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.teachers || []));
      }
      if (!appData.documents) {
        appData.documents = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.documents || []));
      }
    } else {
      appData = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA));
    }
  } catch (err) {
    console.warn('[Sync] Error leyendo caché local:', err);
    appData = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA));
  }

  // 2. Conectar de forma asíncrona con el servidor central para sincronizar
  checkServerAndSync(false);
}

async function checkServerAndSync(showUserFeedback = false) {
  updateSyncStatusUI('checking', 'Conectando...');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(`${API_BASE_URL}/api/data`, {
      method: 'GET',
      headers: getAuthHeaders({ 'Accept': 'application/json' }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.status === 401) {
      authStatus.authenticated = false;
      showAuthScreen('login');
      return;
    }

    if (response.ok) {
      const serverData = await response.json();
      if (serverData && typeof serverData === 'object') {
        appData = { ...DEFAULT_SAMPLE_DATA, ...serverData };
        if (!appData.institutions || appData.institutions.length === 0) {
          appData.institutions = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.institutions));
        }
        if (!appData.teachers || appData.teachers.length === 0) {
          appData.teachers = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.teachers || []));
        }
        if (!appData.documents) {
          appData.documents = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA.documents || []));
        }

        // Actualizar caché de localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        } catch (e) {}

        isServerConnected = true;
        updateSyncStatusUI('connected', 'Sincronizado');
        
        // Re-renderizar datos con los datos sincronizados del servidor
        initTheme();
        initClockAndDate();
        renderAll();

        // Inicializar escucha SSE para actualizaciones en vivo
        initSSE();

        if (showUserFeedback) {
          showToast('Conexión exitosa con el servidor multi-navegador', 'success');
        }
        return;
      }
    }
    throw new Error('Servidor no respondió con datos válidos');
  } catch (err) {
    console.info('[Sync] Modo local activo (servidor central no disponible):', err.message);
    isServerConnected = false;
    updateSyncStatusUI('offline', 'Modo Local');
    if (showUserFeedback) {
      showToast('Servidor no detectado. Ejecuta iniciar.bat para sincronizar.', 'info');
    }
  }
}

async function saveData(syncWithServer = true) {
  // 1. Guardar siempre en localStorage (caché local rápido)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (err) {
    console.error('Error guardando en localStorage:', err);
  }

  // 2. Si el servidor está activo y no estamos recibiendo una actualización externa, sincronizar
  if (isServerConnected && syncWithServer && !isUpdatingFromRemote) {
    updateSyncStatusUI('saving', 'Guardando...');
    isSavingRemote = true;

    try {
      const response = await fetch(`${API_BASE_URL}/api/data`, {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          'X-Client-ID': CLIENT_ID
        }),
        body: JSON.stringify(appData)
      });

      if (response.status === 401) {
        authStatus.authenticated = false;
        showAuthScreen('login');
        return;
      }

      if (response.ok) {
        updateSyncStatusUI('connected', 'Sincronizado');
      } else {
        throw new Error('Error en respuesta al guardar en servidor');
      }
    } catch (err) {
      console.warn('[Sync] Error al enviar cambios al servidor:', err);
      isServerConnected = false;
      updateSyncStatusUI('offline', 'Modo Local');
    } finally {
      isSavingRemote = false;
    }
  }
}

// --- Escucha de Cambios en Tiempo Real (Server-Sent Events) ---
function initSSE() {
  if (sseEventSource || !isServerConnected) return;

  try {
    sseEventSource = new EventSource(`${API_BASE_URL}/api/events`);

    sseEventSource.addEventListener('data-updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        // Ignorar si el cambio fue emitido por esta misma pestaña/navegador
        if (payload.originClientId === CLIENT_ID) return;

        if (payload.data) {
          isUpdatingFromRemote = true;
          appData = { ...DEFAULT_SAMPLE_DATA, ...payload.data };

          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
          } catch (err) {}

          // Si el usuario no tiene enfocado el bloc de notas, actualizarlo
          const notesTextarea = document.getElementById('quickNotesTextarea');
          if (notesTextarea && document.activeElement !== notesTextarea) {
            notesTextarea.value = appData.quickNotes || '';
          }

          // Renderizar cambios en vivo en la pantalla
          initTheme();
          renderMainCardsSection();
          renderReminders();
          renderQuickLinks();

          showToast('✨ Datos actualizados desde otro navegador', 'info');
          isUpdatingFromRemote = false;
        }
      } catch (err) {
        console.error('[Sync SSE] Error al parsear evento de actualización:', err);
        isUpdatingFromRemote = false;
      }
    });

    sseEventSource.onerror = () => {
      console.warn('[Sync SSE] Conexión SSE interrumpida temporalmente.');
    };
  } catch (err) {
    console.warn('[Sync SSE] Error al conectar con eventos del servidor:', err);
  }
}

// --- Actualización de la Interfaz del Estado de Sincronización ---
function updateSyncStatusUI(state, text) {
  const syncBtn = document.getElementById('syncStatusBtn');
  const syncText = document.getElementById('syncStatusText');
  const modalTitle = document.getElementById('modalSyncStatusTitle');
  const modalDesc = document.getElementById('modalSyncStatusDesc');
  const modalBox = document.querySelector('.sync-status-box');

  if (syncBtn) {
    syncBtn.className = 'sync-status-badge';
    if (state === 'connected') syncBtn.classList.add('sync-connected');
    else if (state === 'offline') syncBtn.classList.add('sync-offline');
    else if (state === 'saving') syncBtn.classList.add('sync-saving');
  }

  if (syncText) {
    syncText.textContent = text;
  }

  if (modalBox) {
    modalBox.classList.remove('sync-connected', 'sync-offline');
    if (state === 'connected') modalBox.classList.add('sync-connected');
    else if (state === 'offline') modalBox.classList.add('sync-offline');
  }

  if (modalTitle) {
    if (state === 'connected') {
      modalTitle.innerHTML = '<span style="color: #34d399;"><i class="fa-solid fa-circle-check"></i> Sincronizado en Tiempo Real (Servidor Activo)</span>';
    } else if (state === 'offline') {
      modalTitle.innerHTML = '<span style="color: #fbbf24;"><i class="fa-solid fa-circle-exclamation"></i> Modo Local (Sin Servidor Compartido)</span>';
    } else if (state === 'saving') {
      modalTitle.innerHTML = '<span style="color: #38bdf8;"><i class="fa-solid fa-spinner fa-spin"></i> Guardando cambios en el servidor central...</span>';
    } else {
      modalTitle.textContent = 'Comprobando conexión con servidor local...';
    }
  }

  if (modalDesc) {
    if (state === 'connected') {
      modalDesc.innerHTML = '¡Excelente! Todos los navegadores que abran <code>http://localhost:3000</code> comparten y actualizan la información de forma automática y unificada.';
    } else {
      modalDesc.innerHTML = 'Actualmente los cambios solo se guardan en este navegador. Para sincronizar con Chrome, Edge, Firefox y Brave, ejecuta <code>iniciar.bat</code> o corre <code>npm start</code>.';
    }
  }
}

// --- Inicialización de Tema y Reloj ---
function initTheme() {
  const currentTheme = appData.theme || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(currentTheme);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  icon.className = theme === 'dark' ? 'fa-solid fa-moon theme-icon' : 'fa-solid fa-sun theme-icon';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  appData.theme = newTheme;
  saveData();
  updateThemeIcon(newTheme);
  showToast(`Tema cambiado a ${newTheme === 'dark' ? 'Oscuro' : 'Claro'}`, 'info');
}

function initClockAndDate() {
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('currentDateDisplay');
  const greetingEl = document.getElementById('greetingText');

  function update() {
    const now = new Date();
    
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    if (dateEl) {
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('es-ES', options);
    }

    if (greetingEl) {
      const hour = now.getHours();
      let greeting = '¡Hola';
      if (hour >= 6 && hour < 12) {
        greeting = '¡Buenos días';
      } else if (hour >= 12 && hour < 20) {
        greeting = '¡Buenas tardes';
      } else {
        greeting = '¡Buenas noches';
      }
      
      const name = appData.userName ? `, ${escapeHtml(appData.userName)}` : '';
      greetingEl.textContent = `${greeting}${name}! 👋`;
    }
  }

  update();
  setInterval(update, 1000);
}

// --- Renderizado General ---
function renderAll() {
  updateViewModeUI();
  renderQuickLinks();
  renderMainCardsSection();
  renderReminders();
  renderQuickNotes();
  renderStats();
  updateDatalists();
  updateReminderClassroomOptions();
}

// --- Switch de Vista: Por Materia vs Por Institución vs Profesores vs Biblioteca PDF ---
function updateViewModeUI() {
  const subjectsBtn = document.getElementById('viewModeSubjectsBtn');
  const institutionsBtn = document.getElementById('viewModeInstitutionsBtn');
  const teachersBtn = document.getElementById('viewModeTeachersBtn');
  const pdfsBtn = document.getElementById('viewModePdfsBtn');
  const title = document.getElementById('sectionMainTitle');
  const addBtnLabel = document.getElementById('addBtnLabel');
  const emptyAddBtnLabel = document.getElementById('emptyAddBtnLabel');
  const pdfDropzone = document.getElementById('pdfDropzone');
  const pdfStatusFilterWrapper = document.getElementById('pdfStatusFilterWrapper');

  const mode = appData.activeViewMode || 'subjects';

  if (subjectsBtn && institutionsBtn && teachersBtn && pdfsBtn) {
    subjectsBtn.classList.toggle('active', mode === 'subjects');
    institutionsBtn.classList.toggle('active', mode === 'institutions');
    teachersBtn.classList.toggle('active', mode === 'teachers');
    pdfsBtn.classList.toggle('active', mode === 'pdfs');
  }

  // Toggle visibility of PDF specific dropzone and status filter
  if (pdfDropzone) {
    pdfDropzone.style.display = mode === 'pdfs' ? 'flex' : 'none';
  }
  if (pdfStatusFilterWrapper) {
    pdfStatusFilterWrapper.style.display = mode === 'pdfs' ? 'flex' : 'none';
  }

  if (title) {
    if (mode === 'subjects') {
      title.innerHTML = '<i class="fa-solid fa-graduation-cap text-accent"></i> Aulas Virtuales';
    } else if (mode === 'institutions') {
      title.innerHTML = '<i class="fa-solid fa-building-columns text-accent"></i> Campus por Institución';
    } else if (mode === 'teachers') {
      title.innerHTML = '<i class="fa-solid fa-chalkboard-user text-accent"></i> Directorio de Profesores';
    } else if (mode === 'pdfs') {
      title.innerHTML = '<i class="fa-solid fa-file-pdf text-accent"></i> Biblioteca de Documentos PDF';
    }
  }

  if (addBtnLabel) {
    if (mode === 'subjects') addBtnLabel.textContent = 'Nueva Aula';
    else if (mode === 'institutions') addBtnLabel.textContent = 'Nueva Institución';
    else if (mode === 'teachers') addBtnLabel.textContent = 'Nuevo Profesor';
    else if (mode === 'pdfs') addBtnLabel.textContent = 'Subir PDF';
  }

  if (emptyAddBtnLabel) {
    if (mode === 'subjects') emptyAddBtnLabel.textContent = 'Agregar mi primera aula';
    else if (mode === 'institutions') emptyAddBtnLabel.textContent = 'Agregar mi primera institución';
    else if (mode === 'teachers') emptyAddBtnLabel.textContent = 'Agregar mi primer profesor';
    else if (mode === 'pdfs') emptyAddBtnLabel.textContent = 'Subir mi primer PDF';
  }
}

function setViewMode(mode) {
  appData.activeViewMode = mode;
  activeCareerFilter = 'ALL';
  activeDayFilter = 'ALL';
  activePdfCategoryFilter = 'ALL';
  activePdfStatusFilter = 'ALL';
  saveData();
  renderAll();
}

// --- Renderizado: Sección Principal (Materias, Instituciones, Profesores o Biblioteca PDF) ---
function renderMainCardsSection() {
  renderDayFilters();
  if (appData.activeViewMode === 'subjects') {
    renderCareerFilters();
    renderClassrooms();
  } else if (appData.activeViewMode === 'institutions') {
    renderInstitutionFilters();
    renderInstitutions();
  } else if (appData.activeViewMode === 'teachers') {
    renderTeacherFilters();
    renderTeachers();
  } else if (appData.activeViewMode === 'pdfs') {
    renderPdfFilters();
    renderPdfs();
  }
}

// --- Renderizado: Enlaces Rápidos ---
function renderQuickLinks() {
  const container = document.getElementById('quickLinksContainer');
  if (!container) return;

  if (!appData.quickLinks || appData.quickLinks.length === 0) {
    container.innerHTML = '<span class="text-secondary" style="font-size: 0.82rem;">No tienes enlaces rápidos agregados.</span>';
    return;
  }

  container.innerHTML = appData.quickLinks.map(link => `
    <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="quick-link-item" title="${escapeHtml(link.title)}">
      <i class="fa-solid ${escapeHtml(link.icon || 'fa-link')}"></i>
      <span>${escapeHtml(link.title)}</span>
    </a>
  `).join('');
}

// --- Filtro interactivo por Día de Cursada (Vista por Materia) ---
function renderDayFilters() {
  const select = document.getElementById('dayFilterSelect');
  const pillsContainer = document.getElementById('dayPillsContainer');
  const dropdownWrapper = document.getElementById('dayFilterDropdownWrapper');
  
  if (appData.activeViewMode !== 'subjects') {
    if (pillsContainer) pillsContainer.style.display = 'none';
    if (dropdownWrapper) dropdownWrapper.style.display = 'none';
    return;
  } else {
    if (pillsContainer) pillsContainer.style.display = 'flex';
    if (dropdownWrapper) dropdownWrapper.style.display = 'flex';
  }

  const todayKey = getTodayDayKey();
  const todayObj = DAYS_OF_WEEK.find(d => d.key === todayKey);

  // Conteo de materias por cada día
  const dayCounts = { ALL: appData.classrooms.length };
  DAYS_OF_WEEK.forEach(d => { dayCounts[d.key] = 0; });
  
  appData.classrooms.forEach(c => {
    const days = parseDaysFromSchedule(c.schedule);
    days.forEach(k => {
      if (dayCounts[k] !== undefined) dayCounts[k]++;
    });
  });

  const todayCount = dayCounts[todayKey] || 0;

  // Actualizar Select Dropdown
  if (select) {
    select.innerHTML = `
      <option value="ALL">📅 Todos los días (${appData.classrooms.length})</option>
      <option value="TODAY">⚡ Hoy (${todayObj ? todayObj.short : 'Hoy'}: ${todayCount})</option>
      ${DAYS_OF_WEEK.map(d => `
        <option value="${d.key}">${d.label} (${dayCounts[d.key] || 0})</option>
      `).join('')}
    `;
    select.value = activeDayFilter;
  }

  // Actualizar Barra de Botones/Pills
  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <button class="day-pill ${activeDayFilter === 'ALL' ? 'active' : ''}" data-day="ALL" title="Ver todas las materias">
        <i class="fa-solid fa-calendar-week"></i>
        <span>Todos</span>
        <span class="day-pill-count">${appData.classrooms.length}</span>
      </button>
      ${DAYS_OF_WEEK.map(d => {
        const isSelected = activeDayFilter === d.key || (activeDayFilter === 'TODAY' && d.key === todayKey);
        const isToday = d.key === todayKey;
        const count = dayCounts[d.key] || 0;
        return `
          <button class="day-pill ${isSelected ? 'active' : ''} ${isToday ? 'is-today' : ''}" data-day="${d.key}" title="${d.label}${isToday ? ' (¡Hoy!)' : ''}">
            <span>${d.label}</span>
            <span class="day-pill-count">${count}</span>
          </button>
        `;
      }).join('')}
    `;

    pillsContainer.querySelectorAll('.day-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDayFilter = btn.getAttribute('data-day');
        if (select) select.value = activeDayFilter;
        renderDayFilters();
        renderClassrooms();
      });
    });
  }
}

// --- Filtros de Carreras para Vista por Materia ---
function renderCareerFilters() {
  const select = document.getElementById('careerFilterSelect');
  const pillsContainer = document.getElementById('careerPillsContainer');
  
  const careers = Array.from(new Set(appData.classrooms.map(c => c.career.trim()).filter(Boolean)));
  
  if (select) {
    select.innerHTML = '<option value="ALL">Todas las carreras / áreas</option>' +
      careers.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = careers.includes(activeCareerFilter) ? activeCareerFilter : 'ALL';
  }

  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <button class="career-pill ${activeCareerFilter === 'ALL' ? 'active' : ''}" data-filter-val="ALL">
        Todas (${appData.classrooms.length})
      </button>
      ${careers.map(c => {
        const count = appData.classrooms.filter(item => item.career === c).length;
        const isActive = activeCareerFilter === c ? 'active' : '';
        return `<button class="career-pill ${isActive}" data-filter-val="${escapeHtml(c)}">
          ${escapeHtml(c)} (${count})
        </button>`;
      }).join('')}
    `;

    pillsContainer.querySelectorAll('.career-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCareerFilter = btn.getAttribute('data-filter-val');
        if (select) select.value = activeCareerFilter;
        renderCareerFilters();
        renderClassrooms();
      });
    });
  }
}

// --- Filtros para Vista por Institución ---
function renderInstitutionFilters() {
  const select = document.getElementById('careerFilterSelect');
  const pillsContainer = document.getElementById('careerPillsContainer');
  
  const instNames = Array.from(new Set(appData.institutions.map(i => i.name.trim()).filter(Boolean)));
  
  if (select) {
    select.innerHTML = '<option value="ALL">Todas las instituciones</option>' +
      instNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    select.value = instNames.includes(activeCareerFilter) ? activeCareerFilter : 'ALL';
  }

  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <button class="career-pill ${activeCareerFilter === 'ALL' ? 'active' : ''}" data-filter-val="ALL">
        Todas (${appData.institutions.length})
      </button>
      ${instNames.map(name => {
        const isActive = activeCareerFilter === name ? 'active' : '';
        return `<button class="career-pill ${isActive}" data-filter-val="${escapeHtml(name)}">
          ${escapeHtml(name)}
        </button>`;
      }).join('')}
    `;

    pillsContainer.querySelectorAll('.career-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCareerFilter = btn.getAttribute('data-filter-val');
        if (select) select.value = activeCareerFilter;
        renderInstitutionFilters();
        renderInstitutions();
      });
    });
  }
}

// --- Renderizado de Materias (Vista por Materia) ---
function renderClassrooms() {
  const grid = document.getElementById('classroomsGrid');
  const emptyState = document.getElementById('classroomsEmptyState');
  const emptyTitle = document.getElementById('emptyStateTitle');
  const emptyDesc = document.getElementById('emptyStateDesc');
  const countBadge = document.getElementById('classroomsCountBadge');
  if (!grid) return;

  let filtered = appData.classrooms;

  // 1. Filtro por carrera
  if (activeCareerFilter !== 'ALL') {
    filtered = filtered.filter(c => c.career.toLowerCase() === activeCareerFilter.toLowerCase());
  }

  // 2. Filtro interactivo por día de la semana
  let targetDayKey = null;
  if (activeDayFilter === 'TODAY') {
    targetDayKey = getTodayDayKey();
  } else if (activeDayFilter !== 'ALL') {
    targetDayKey = activeDayFilter;
  }

  if (targetDayKey) {
    filtered = filtered.filter(c => {
      const days = parseDaysFromSchedule(c.schedule);
      return days.includes(targetDayKey);
    });
  }

  // 3. Filtro por término de búsqueda global
  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.career.toLowerCase().includes(q) ||
      (c.institution && c.institution.toLowerCase().includes(q)) ||
      (c.teacher && c.teacher.toLowerCase().includes(q)) ||
      (c.schedule && c.schedule.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  }

  // Actualizar etiqueta del contador con contexto del día
  if (countBadge) {
    let dayLabel = '';
    if (activeDayFilter === 'TODAY') {
      const tObj = DAYS_OF_WEEK.find(d => d.key === getTodayDayKey());
      dayLabel = ` · Hoy (${tObj ? tObj.label : ''})`;
    } else if (activeDayFilter !== 'ALL') {
      const dObj = DAYS_OF_WEEK.find(d => d.key === activeDayFilter);
      dayLabel = ` · ${dObj ? dObj.label : activeDayFilter}`;
    }
    countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'materia' : 'materias'}${dayLabel}`;
  }

  // Estado vacío personalizado
  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      if (activeDayFilter !== 'ALL') {
        const dObj = DAYS_OF_WEEK.find(d => d.key === (activeDayFilter === 'TODAY' ? getTodayDayKey() : activeDayFilter));
        const dayName = dObj ? dObj.label : 'este día';
        emptyTitle.textContent = `No tienes materias los días ${dayName}`;
        emptyDesc.innerHTML = `No se encontraron materias con horario registrado para los <b>${escapeHtml(dayName)}</b>.<br><button type="button" class="btn btn-secondary btn-sm" id="resetDayFilterEmptyBtn" style="margin-top: 12px;"><i class="fa-solid fa-calendar-days"></i> Ver todas las materias</button>`;
        emptyState.style.display = 'flex';
        
        document.getElementById('resetDayFilterEmptyBtn')?.addEventListener('click', () => {
          activeDayFilter = 'ALL';
          renderDayFilters();
          renderClassrooms();
        });
      } else {
        emptyTitle.textContent = 'No se encontraron materias';
        emptyDesc.textContent = 'Puedes agregar una nueva materia o aula virtual usando el botón "+ Nueva Aula".';
        emptyState.style.display = 'flex';
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const effectiveActiveDay = activeDayFilter === 'TODAY' ? getTodayDayKey() : activeDayFilter;

  grid.innerHTML = filtered.map(c => {
    const platformClass = `platform-${c.platform || 'custom'}`;
    const platformLabel = getPlatformLabel(c.platform);
    const cardColor = c.color || '#6366f1';
    const cardIcon = c.icon || 'fa-graduation-cap';

    // Buscar profesor registrado para vincular contacto directo
    const matchingTeacher = (appData.teachers || []).find(t => 
      t.name && c.teacher && (
        t.name.toLowerCase() === c.teacher.toLowerCase() ||
        c.teacher.toLowerCase().includes(t.name.toLowerCase()) ||
        t.name.toLowerCase().includes(c.teacher.toLowerCase())
      )
    );

    // Cantidad de PDFs vinculados a esta materia
    const classroomPdfs = (appData.documents || []).filter(d => d.classroomId === c.id);

    // Días parseados para mini badges en la tarjeta
    const parsedDays = parseDaysFromSchedule(c.schedule);
    const dayBadgesHtml = parsedDays.length > 0 ? `
      <span class="schedule-day-chips-list">
        ${parsedDays.map(dKey => {
          const dObj = DAYS_OF_WEEK.find(d => d.key === dKey);
          const isHighlighted = (effectiveActiveDay === dKey);
          return `<span class="schedule-day-badge ${isHighlighted ? 'highlighted-day' : ''}" title="${dObj ? dObj.label : dKey}">${dObj ? dObj.short : dKey}</span>`;
        }).join('')}
      </span>
    ` : '';

    return `
      <div class="classroom-card" style="--card-color: ${cardColor}">
        <!-- Top Row -->
        <div class="card-top-row">
          <div class="card-tags">
            <span class="career-tag">${escapeHtml(c.career)}</span>
            <span class="platform-tag ${platformClass}">
              <i class="${getPlatformIcon(c.platform)}"></i>
              ${escapeHtml(platformLabel)}
            </span>
            ${classroomPdfs.length > 0 ? `
              <span class="classroom-pdf-link-badge filter-by-subject-pdf-btn" data-classroom-id="${c.id}" title="Ver ${classroomPdfs.length} documentos PDF de esta materia">
                <i class="fa-solid fa-file-pdf"></i>
                <span>${classroomPdfs.length} ${classroomPdfs.length === 1 ? 'PDF' : 'PDFs'}</span>
              </span>
            ` : `
              <span class="classroom-pdf-link-badge filter-by-subject-pdf-btn" data-classroom-id="${c.id}" title="Subir o ver PDFs de esta materia" style="opacity: 0.65;">
                <i class="fa-solid fa-file-pdf"></i>
                <span>+ PDF</span>
              </span>
            `}
          </div>
          <div class="card-actions-menu">
            <button class="card-menu-btn edit-classroom-btn" data-id="${c.id}" title="Editar Materia">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="card-menu-btn delete-classroom-btn" data-id="${c.id}" title="Eliminar Materia">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Main Info -->
        <div class="card-main-info">
          <div class="card-icon-box">
            <i class="fa-solid ${escapeHtml(cardIcon)}"></i>
          </div>
          <div class="card-text-details">
            <h3 class="card-title">${escapeHtml(c.name)}</h3>
            ${c.institution ? `<p class="card-subtitle"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(c.institution)}</p>` : ''}
            ${c.teacher ? `
              <p class="card-subtitle">
                <i class="fa-solid fa-chalkboard-user"></i> ${escapeHtml(c.teacher)}
                ${matchingTeacher && matchingTeacher.email ? `
                  <a href="mailto:${escapeHtml(matchingTeacher.email)}" class="card-teacher-mail-chip" title="Enviar mail al docente (${escapeHtml(matchingTeacher.email)})">
                    <i class="fa-solid fa-envelope"></i>
                  </a>
                ` : ''}
              </p>
            ` : ''}
          </div>
        </div>

        <!-- Meta Details -->
        <div class="card-meta-list">
          ${c.schedule ? `
            <div class="card-meta-item card-schedule-item">
              <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i class="fa-regular fa-calendar-days"></i>
                <span>${escapeHtml(c.schedule)}</span>
              </div>
              ${dayBadgesHtml}
            </div>
          ` : ''}
          ${c.notes ? `
            <div class="card-meta-item notes-text">
              <i class="fa-solid fa-key"></i>
              <span>${escapeHtml(c.notes)}</span>
            </div>
          ` : ''}
        </div>

        <!-- Action Buttons -->
        <div class="card-actions-row">
          <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="btn-open-classroom" title="Ir al aula/campus de ${escapeHtml(c.name)}">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
            <span>Aula</span>
          </a>

          ${c.googleUrl ? `
            <a href="${escapeHtml(c.googleUrl)}" target="_blank" rel="noopener noreferrer" class="btn-open-google-classroom" title="Ir a Google Classroom de ${escapeHtml(c.name)}">
              <i class="fa-solid fa-chalkboard-user"></i>
              <span>Classroom</span>
            </a>
          ` : ''}

          ${c.meetingUrl ? `
            <a href="${escapeHtml(c.meetingUrl)}" target="_blank" rel="noopener noreferrer" class="btn-open-meeting" title="Unirse a la clase por Meet / Zoom">
              <i class="fa-solid fa-video"></i>
              <span>Meet</span>
            </a>
          ` : ''}

          ${c.driveUrl ? `
            <a href="${escapeHtml(c.driveUrl)}" target="_blank" rel="noopener noreferrer" class="btn-open-drive" title="Abrir carpeta de Drive / Recursos compartidos">
              <i class="fa-brands fa-google-drive"></i>
              <span>Drive</span>
            </a>
          ` : ''}

          <button class="btn-icon-secondary copy-link-btn" data-url="${escapeHtml(c.url)}" title="Copiar enlace del aula">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.filter-by-subject-pdf-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const classroomId = btn.getAttribute('data-classroom-id');
      filterPdfsByClassroom(classroomId);
    });
  });

  // Enlazar eventos de tarjetas de aulas
  grid.querySelectorAll('.edit-classroom-btn').forEach(btn => {
    btn.addEventListener('click', () => openClassroomModal(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.delete-classroom-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteClassroom(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.set-google-classroom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openClassroomModal(id);
      setTimeout(() => {
        const gInput = document.getElementById('classroomGoogleUrl');
        if (gInput) {
          gInput.focus();
          gInput.classList.add('highlight-input');
          setTimeout(() => gInput.classList.remove('highlight-input'), 1500);
        }
      }, 100);
    });
  });

  grid.querySelectorAll('.set-meeting-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openClassroomModal(id);
      setTimeout(() => {
        const meetInput = document.getElementById('classroomMeetingUrl');
        if (meetInput) {
          meetInput.focus();
          meetInput.classList.add('highlight-input');
          setTimeout(() => meetInput.classList.remove('highlight-input'), 1500);
        }
      }, 100);
    });
  });

  grid.querySelectorAll('.set-drive-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openClassroomModal(id);
      setTimeout(() => {
        const driveInput = document.getElementById('classroomDriveUrl');
        if (driveInput) {
          driveInput.focus();
          driveInput.classList.add('highlight-input');
          setTimeout(() => driveInput.classList.remove('highlight-input'), 1500);
        }
      }, 100);
    });
  });

  grid.querySelectorAll('.copy-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      navigator.clipboard.writeText(url).then(() => {
        showToast('¡Enlace copiado al portapapeles!', 'success');
      }).catch(() => {
        showToast('No se pudo copiar el enlace', 'error');
      });
    });
  });
}

// --- Renderizado de Instituciones (Vista por Institución) ---
function renderInstitutions() {
  const grid = document.getElementById('classroomsGrid');
  const emptyState = document.getElementById('classroomsEmptyState');
  const emptyTitle = document.getElementById('emptyStateTitle');
  const emptyDesc = document.getElementById('emptyStateDesc');
  const countBadge = document.getElementById('classroomsCountBadge');
  if (!grid) return;

  let filtered = appData.institutions;

  if (activeCareerFilter !== 'ALL') {
    filtered = filtered.filter(i => i.name.toLowerCase() === activeCareerFilter.toLowerCase());
  }

  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(i => 
      i.name.toLowerCase().includes(q) ||
      (i.notes && i.notes.toLowerCase().includes(q))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'institución' : 'instituciones'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      emptyTitle.textContent = 'No se encontraron instituciones';
      emptyDesc.textContent = 'Puedes agregar una institución o campus general usando el botón "+ Nueva Institución".';
      emptyState.style.display = 'flex';
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = filtered.map(inst => {
    const cardColor = inst.color || '#6366f1';
    const cardIcon = inst.icon || 'fa-building-columns';
    
    // Obtener materias asociadas a esta institución
    const relatedSubjects = appData.classrooms.filter(c => 
      c.institution && c.institution.trim().toLowerCase() === inst.name.trim().toLowerCase()
    );

    return `
      <div class="institution-card" style="--card-color: ${cardColor}">
        <!-- Top Row -->
        <div class="card-top-row">
          <div class="card-tags">
            <span class="career-tag" style="color: ${cardColor};">Portal Institucional</span>
            <span class="badge" style="font-size: 0.7rem;">${relatedSubjects.length} ${relatedSubjects.length === 1 ? 'materia' : 'materias'}</span>
          </div>
          <div class="card-actions-menu">
            <button class="card-menu-btn edit-institution-btn" data-id="${inst.id}" title="Editar Institución">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="card-menu-btn delete-institution-btn" data-id="${inst.id}" title="Eliminar Institución">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Main Info -->
        <div class="card-main-info">
          <div class="card-icon-box" style="color: ${cardColor}">
            <i class="fa-solid ${escapeHtml(cardIcon)}"></i>
          </div>
          <div class="card-text-details">
            <h3 class="card-title">${escapeHtml(inst.name)}</h3>
          </div>
        </div>

        <!-- Enrolled Subjects Inside This Campus -->
        <div class="inst-subjects-box">
          <div class="inst-subjects-title">
            <span><i class="fa-solid fa-book-bookmark"></i> Materias en este Campus</span>
          </div>
          <div class="inst-subjects-list">
            ${relatedSubjects.length > 0 ? relatedSubjects.map(sub => `
              <div class="inst-subject-item-wrapper">
                <a href="${escapeHtml(sub.url)}" target="_blank" rel="noopener noreferrer" class="inst-subject-chip" title="Abrir aula de ${escapeHtml(sub.name)}">
                  <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.65rem; color: ${sub.color || cardColor};"></i>
                  <span>${escapeHtml(sub.name)}</span>
                </a>
                ${sub.googleUrl ? `
                  <a href="${escapeHtml(sub.googleUrl)}" target="_blank" rel="noopener noreferrer" class="inst-subject-classroom-chip" title="Google Classroom de ${escapeHtml(sub.name)}">
                    <i class="fa-solid fa-chalkboard-user"></i>
                  </a>
                ` : ''}
                ${sub.meetingUrl ? `
                  <a href="${escapeHtml(sub.meetingUrl)}" target="_blank" rel="noopener noreferrer" class="inst-subject-meet-chip" title="Meet / Zoom de ${escapeHtml(sub.name)}">
                    <i class="fa-solid fa-video"></i>
                  </a>
                ` : ''}
                ${sub.driveUrl ? `
                  <a href="${escapeHtml(sub.driveUrl)}" target="_blank" rel="noopener noreferrer" class="inst-subject-drive-chip" title="Carpeta Drive / Recursos de ${escapeHtml(sub.name)}">
                    <i class="fa-brands fa-google-drive"></i>
                  </a>
                ` : ''}
              </div>
            `).join('') : '<span class="text-muted" style="font-size: 0.74rem;">Sin materias asignadas aún</span>'}
          </div>
        </div>

        <!-- Notes / Credentials -->
        ${inst.notes ? `
          <div class="card-meta-list">
            <div class="card-meta-item notes-text">
              <i class="fa-solid fa-key"></i>
              <span>${escapeHtml(inst.notes)}</span>
            </div>
          </div>
        ` : ''}

        <!-- Actions Stack -->
        <div class="inst-actions-stack">
          <a href="${escapeHtml(inst.campusUrl)}" target="_blank" rel="noopener noreferrer" class="btn-open-campus" title="Ingresar al Campus Principal">
            <i class="fa-solid fa-globe"></i>
            <span>Ingresar al Campus General</span>
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem;"></i>
          </a>

          ${inst.portalUrl ? `
            <a href="${escapeHtml(inst.portalUrl)}" target="_blank" rel="noopener noreferrer" class="btn-portal-secondary" title="Portal de Alumnos / SIU Guaraní">
              <i class="fa-solid fa-user-gear"></i>
              <span>Portal de Alumnos / SIU Guaraní</span>
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Enlazar eventos de instituciones
  grid.querySelectorAll('.edit-institution-btn').forEach(btn => {
    btn.addEventListener('click', () => openInstitutionModal(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.delete-institution-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteInstitution(btn.getAttribute('data-id')));
  });
}

// --- Filtros y Renderizado: Vista de Profesores ---
function renderTeacherFilters() {
  const select = document.getElementById('careerFilterSelect');
  const pillsContainer = document.getElementById('careerPillsContainer');
  
  const teachers = appData.teachers || [];
  const instNames = Array.from(new Set(teachers.map(t => (t.institution || '').trim()).filter(Boolean)));
  
  if (select) {
    select.innerHTML = '<option value="ALL">Todas las instituciones / áreas</option>' +
      instNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    select.value = instNames.includes(activeCareerFilter) ? activeCareerFilter : 'ALL';
  }

  if (pillsContainer) {
    pillsContainer.innerHTML = `
      <button class="career-pill ${activeCareerFilter === 'ALL' ? 'active' : ''}" data-filter-val="ALL">
        Todos (${teachers.length})
      </button>
      ${instNames.map(name => {
        const count = teachers.filter(t => t.institution === name).length;
        const isActive = activeCareerFilter === name ? 'active' : '';
        return `<button class="career-pill ${isActive}" data-filter-val="${escapeHtml(name)}">
          ${escapeHtml(name)} (${count})
        </button>`;
      }).join('')}
    `;

    pillsContainer.querySelectorAll('.career-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCareerFilter = btn.getAttribute('data-filter-val');
        if (select) select.value = activeCareerFilter;
        renderTeacherFilters();
        renderTeachers();
      });
    });
  }
}

function renderTeachers() {
  const grid = document.getElementById('classroomsGrid');
  const emptyState = document.getElementById('classroomsEmptyState');
  const emptyTitle = document.getElementById('emptyStateTitle');
  const emptyDesc = document.getElementById('emptyStateDesc');
  const countBadge = document.getElementById('classroomsCountBadge');
  if (!grid) return;

  const teachers = appData.teachers || [];
  let filtered = teachers;

  if (activeCareerFilter !== 'ALL') {
    filtered = filtered.filter(t => (t.institution || '').toLowerCase() === activeCareerFilter.toLowerCase());
  }

  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(t => 
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.email && t.email.toLowerCase().includes(q)) ||
      (t.institution && t.institution.toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q)) ||
      (t.phone && t.phone.toLowerCase().includes(q)) ||
      (t.notes && t.notes.toLowerCase().includes(q))
    );
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'profesor' : 'profesores'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      emptyTitle.textContent = 'No se encontraron profesores';
      emptyDesc.textContent = 'Puedes guardar los datos de contacto de tus profesores usando el botón "+ Nuevo Profesor".';
      emptyState.style.display = 'flex';
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = filtered.map(t => {
    const cardColor = t.color || '#6366f1';
    const cardIcon = t.icon || 'fa-chalkboard-user';

    return `
      <div class="teacher-card" style="--card-color: ${cardColor}">
        <!-- Top Row -->
        <div class="card-top-row">
          <div class="card-tags">
            ${t.institution ? `<span class="career-tag" style="color: ${cardColor};">${escapeHtml(t.institution)}</span>` : ''}
            ${t.subject ? `<span class="platform-tag platform-custom"><i class="fa-solid fa-book"></i> ${escapeHtml(t.subject)}</span>` : ''}
          </div>
          <div class="card-actions-menu">
            <button class="card-menu-btn edit-teacher-btn" data-id="${t.id}" title="Editar Profesor">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button class="card-menu-btn delete-teacher-btn" data-id="${t.id}" title="Eliminar Profesor">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Main Info -->
        <div class="card-main-info">
          <div class="card-icon-box" style="color: ${cardColor}; background: ${cardColor}1a;">
            <i class="fa-solid ${escapeHtml(cardIcon)}"></i>
          </div>
          <div class="card-text-details">
            <h3 class="card-title">${escapeHtml(t.name)}</h3>
            ${t.email ? `
              <a href="mailto:${escapeHtml(t.email)}" class="teacher-email-preview" title="Enviar correo a ${escapeHtml(t.email)}">
                <i class="fa-solid fa-envelope"></i> ${escapeHtml(t.email)}
              </a>
            ` : '<span class="text-muted" style="font-size: 0.78rem;">Sin correo registrado</span>'}
          </div>
        </div>

        <!-- Contact & Meta Details -->
        <div class="card-meta-list">
          ${t.phone ? `
            <div class="card-meta-item">
              <i class="fa-solid fa-phone"></i>
              <a href="${t.phone.startsWith('+') || t.phone.startsWith('http') ? (t.phone.startsWith('http') ? t.phone : 'https://wa.me/' + t.phone.replace(/[^0-9]/g, '')) : 'tel:' + t.phone}" target="_blank" rel="noopener noreferrer" class="teacher-phone-link">
                ${escapeHtml(t.phone)}
              </a>
            </div>
          ` : ''}
          ${t.officeHours ? `
            <div class="card-meta-item">
              <i class="fa-regular fa-clock"></i>
              <span>${escapeHtml(t.officeHours)}</span>
            </div>
          ` : ''}
          ${t.notes ? `
            <div class="card-meta-item notes-text">
              <i class="fa-solid fa-circle-info"></i>
              <span>${escapeHtml(t.notes)}</span>
            </div>
          ` : ''}
        </div>

        <!-- Action Buttons -->
        <div class="card-actions-row">
          ${t.email ? `
            <a href="mailto:${escapeHtml(t.email)}" class="btn-send-email" title="Redactar correo a ${escapeHtml(t.name)}">
              <i class="fa-solid fa-paper-plane"></i>
              <span>Enviar Mail</span>
            </a>
            <button type="button" class="btn-icon-secondary copy-email-btn" data-email="${escapeHtml(t.email)}" title="Copiar email al portapapeles">
              <i class="fa-regular fa-copy"></i>
            </button>
          ` : `
            <button type="button" class="btn-send-email btn-email-unset edit-teacher-btn" data-id="${t.id}" title="Agregar email de contacto">
              <i class="fa-solid fa-envelope-open-text"></i>
              <span>+ Agregar Email</span>
            </button>
          `}

          ${t.meetUrl ? `
            <a href="${escapeHtml(t.meetUrl)}" target="_blank" rel="noopener noreferrer" class="btn-icon-secondary btn-teacher-meet" title="Sala de Consultas / Meet">
              <i class="fa-solid fa-video" style="color: var(--secondary);"></i>
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Enlazar eventos de profesores
  grid.querySelectorAll('.edit-teacher-btn').forEach(btn => {
    btn.addEventListener('click', () => openTeacherModal(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.delete-teacher-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTeacher(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.copy-email-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.getAttribute('data-email');
      navigator.clipboard.writeText(email).then(() => {
        showToast('¡Email copiado al portapapeles!', 'success');
      }).catch(() => {
        showToast('No se pudo copiar el email', 'error');
      });
    });
  });
}

// --- FILTROS Y RENDERIZADO: BIBLIOTECA LOCAL DE PDFs ---
function getPdfCategoryLabel(cat) {
  const map = {
    guia: '📑 Guía',
    apunte: '📝 Apunte',
    libro: '📖 Libro',
    tp: '💻 TP',
    examen: '📋 Examen',
    resumen: '⚡ Resumen',
    otro: '📁 Documento'
  };
  return map[cat] || '📁 Documento';
}

function getPdfCategoryClass(cat) {
  return `badge-cat-${cat || 'otro'}`;
}

function getPdfCategoryIcon(cat) {
  const map = {
    guia: 'fa-list-check',
    apunte: 'fa-note-sticky',
    libro: 'fa-book',
    tp: 'fa-laptop-code',
    examen: 'fa-file-signature',
    resumen: 'fa-bolt',
    otro: 'fa-file-pdf'
  };
  return map[cat] || 'fa-file-pdf';
}

function getPdfStatusLabel(status) {
  if (status === 'completed') return '✅ Leído';
  if (status === 'reading') return '📖 En lectura';
  return '⏳ Pendiente';
}

function getPdfStatusClass(status) {
  if (status === 'completed') return 'status-completed';
  if (status === 'reading') return 'status-reading';
  return 'status-pending';
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (typeof bytes === 'string' && (bytes.includes('KB') || bytes.includes('MB') || bytes.includes('GB') || bytes.includes('B'))) {
    return bytes;
  }
  const num = Number(bytes);
  if (num < 1024) return num + ' B';
  if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
  return (num / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderPdfFilters() {
  const select = document.getElementById('careerFilterSelect');
  const statusSelect = document.getElementById('pdfStatusFilterSelect');
  const pillsContainer = document.getElementById('careerPillsContainer');
  
  const documents = appData.documents || [];
  
  if (select) {
    select.innerHTML = '<option value="ALL">Todas las materias / áreas</option>' +
      '<option value="GENERAL">General / Sin materia asignada</option>' +
      appData.classrooms.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.career)})</option>`).join('');
    select.value = activeCareerFilter;
  }

  if (statusSelect) {
    statusSelect.value = activePdfStatusFilter;
  }

  const categoryOptions = [
    { id: 'ALL', label: 'Todos', icon: 'fa-folder-open' },
    { id: 'favorites', label: 'Favoritos ⭐', icon: 'fa-star' },
    { id: 'guia', label: 'Guías', icon: 'fa-list-check' },
    { id: 'apunte', label: 'Apuntes', icon: 'fa-note-sticky' },
    { id: 'libro', label: 'Libros', icon: 'fa-book' },
    { id: 'tp', label: 'TPs & Proyectos', icon: 'fa-laptop-code' },
    { id: 'examen', label: 'Exámenes', icon: 'fa-file-signature' },
    { id: 'resumen', label: 'Resúmenes', icon: 'fa-bolt' }
  ];

  if (pillsContainer) {
    pillsContainer.innerHTML = categoryOptions.map(cat => {
      let count = 0;
      if (cat.id === 'ALL') count = documents.length;
      else if (cat.id === 'favorites') count = documents.filter(d => d.isFavorite).length;
      else count = documents.filter(d => d.category === cat.id).length;

      const isActive = activePdfCategoryFilter === cat.id ? 'active' : '';
      return `
        <button class="career-pill ${isActive}" data-pdf-cat="${cat.id}">
          <i class="fa-solid ${cat.icon}"></i> ${cat.label} (${count})
        </button>
      `;
    }).join('');

    pillsContainer.querySelectorAll('.career-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        activePdfCategoryFilter = btn.getAttribute('data-pdf-cat');
        renderPdfFilters();
        renderPdfs();
      });
    });
  }
}

function renderPdfs() {
  const grid = document.getElementById('classroomsGrid');
  const emptyState = document.getElementById('classroomsEmptyState');
  const emptyTitle = document.getElementById('emptyStateTitle');
  const emptyDesc = document.getElementById('emptyStateDesc');
  const countBadge = document.getElementById('classroomsCountBadge');
  if (!grid) return;

  const documents = appData.documents || [];
  let filtered = documents;

  // Filtrar por Materia
  if (activeCareerFilter !== 'ALL') {
    if (activeCareerFilter === 'GENERAL') {
      filtered = filtered.filter(d => !d.classroomId);
    } else {
      filtered = filtered.filter(d => d.classroomId === activeCareerFilter);
    }
  }

  // Filtrar por Categoría
  if (activePdfCategoryFilter !== 'ALL') {
    if (activePdfCategoryFilter === 'favorites') {
      filtered = filtered.filter(d => d.isFavorite);
    } else {
      filtered = filtered.filter(d => d.category === activePdfCategoryFilter);
    }
  }

  // Filtrar por Estado de lectura
  if (activePdfStatusFilter !== 'ALL') {
    if (activePdfStatusFilter === 'favorites') {
      filtered = filtered.filter(d => d.isFavorite);
    } else {
      filtered = filtered.filter(d => d.readStatus === activePdfStatusFilter);
    }
  }

  // Filtrar por búsqueda
  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(d => {
      const matchingClassroom = appData.classrooms.find(c => c.id === d.classroomId);
      const classroomName = matchingClassroom ? matchingClassroom.name.toLowerCase() : '';
      return (
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.author && d.author.toLowerCase().includes(q)) ||
        (d.tags && d.tags.toLowerCase().includes(q)) ||
        (d.notes && d.notes.toLowerCase().includes(q)) ||
        (d.fileName && d.fileName.toLowerCase().includes(q)) ||
        classroomName.includes(q)
      );
    });
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'documento' : 'documentos'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) {
      emptyTitle.textContent = 'No se encontraron documentos PDF';
      emptyDesc.textContent = 'Puedes subir libros, apuntes o guías arrastrando archivos a la zona superior o con el botón "+ Subir PDF".';
      emptyState.style.display = 'flex';
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  grid.innerHTML = filtered.map(doc => {
    const matchingClassroom = appData.classrooms.find(c => c.id === doc.classroomId);
    const classroomName = matchingClassroom ? matchingClassroom.name : 'General / Transversal';
    const cardColor = matchingClassroom ? (matchingClassroom.color || '#6366f1') : '#6366f1';
    const catClass = getPdfCategoryClass(doc.category);
    const catLabel = getPdfCategoryLabel(doc.category);
    const catIcon = getPdfCategoryIcon(doc.category);
    const statusLabel = getPdfStatusLabel(doc.readStatus);
    const statusClass = getPdfStatusClass(doc.readStatus);
    const isFavorite = !!doc.isFavorite;
    const formattedSize = doc.fileSize ? (typeof doc.fileSize === 'number' ? formatFileSize(doc.fileSize) : doc.fileSize) : '';
    const dateFormatted = doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';

    const directFileUrl = `${API_BASE_URL}/api/pdfs/file/${doc.id}`;
    const downloadUrl = `${API_BASE_URL}/api/pdfs/file/${doc.id}?download=1&name=${encodeURIComponent(doc.fileName || doc.title + '.pdf')}`;

    return `
      <div class="pdf-card" style="--card-accent-color: ${cardColor}">
        <!-- Top Row -->
        <div class="pdf-card-top">
          <div class="pdf-type-icon-box">
            <i class="fa-solid ${catIcon}"></i>
          </div>
          <div class="pdf-card-header-text">
            <h3 class="pdf-card-title" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</h3>
            ${doc.author ? `
              <span class="pdf-card-author"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(doc.author)}</span>
            ` : ''}
          </div>
          <button type="button" class="pdf-card-star-btn ${isFavorite ? 'is-favorite' : ''}" data-id="${doc.id}" title="${isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}">
            <i class="${isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
        </div>

        <!-- Meta Pills -->
        <div class="pdf-card-meta-row">
          <span class="badge ${catClass}">${catLabel}</span>
          <span class="pdf-badge-classroom" title="${escapeHtml(classroomName)}">
            <i class="fa-solid fa-book" style="color: ${cardColor};"></i> ${escapeHtml(classroomName)}
          </span>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
          ${doc.tags ? `<span class="badge" style="font-size: 0.68rem; opacity: 0.85;">🏷️ ${escapeHtml(doc.tags.split(',')[0].trim())}</span>` : ''}
        </div>

        <!-- Notes Preview -->
        ${doc.notes ? `
          <div class="pdf-card-notes-preview" title="${escapeHtml(doc.notes)}">
            <i class="fa-solid fa-feather-pointed" style="color: var(--accent); margin-right: 4px;"></i>${escapeHtml(doc.notes)}
          </div>
        ` : ''}

        <!-- Footer Actions -->
        <div class="pdf-card-footer">
          <div class="pdf-file-info">
            <span><i class="fa-regular fa-file-pdf"></i> ${escapeHtml(formattedSize || 'PDF')}</span>
            ${dateFormatted ? `<span>&bull; ${dateFormatted}</span>` : ''}
          </div>

          <div class="pdf-card-actions">
            <button type="button" class="pdf-action-btn-view open-pdf-reader-btn" data-id="${doc.id}" title="Abrir en el visor interactivo de estudio">
              <i class="fa-solid fa-book-open-reader"></i>
              <span>Leer</span>
            </button>

            <a href="${directFileUrl}" target="_blank" rel="noopener noreferrer" class="pdf-action-icon-btn open-external-pdf-btn" data-id="${doc.id}" title="Abrir en pestaña nueva">
              <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>

            <a href="${downloadUrl}" download="${escapeHtml(doc.fileName || doc.title + '.pdf')}" class="pdf-action-icon-btn download-pdf-btn" data-id="${doc.id}" title="Descargar archivo PDF">
              <i class="fa-solid fa-download"></i>
            </a>

            <button type="button" class="pdf-action-icon-btn edit-pdf-btn" data-id="${doc.id}" title="Editar información del documento">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>

            <button type="button" class="pdf-action-icon-btn btn-delete delete-pdf-btn" data-id="${doc.id}" title="Eliminar documento de la biblioteca">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Enlazar eventos de tarjetas PDF
  grid.querySelectorAll('.open-pdf-reader-btn').forEach(btn => {
    btn.addEventListener('click', () => openPdfReader(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.open-external-pdf-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.getAttribute('data-id');
      const doc = (appData.documents || []).find(d => d.id === id);
      if (!isServerConnected) {
        e.preventDefault();
        const offlineData = await getPdfFromIndexedDb(id);
        if (offlineData && offlineData.fileData) {
          const blobUrl = base64ToBlobUrl(offlineData.fileData);
          window.open(blobUrl, '_blank');
        } else {
          showToast('El servidor local no está activo para abrir el archivo externo', 'warning');
        }
      }
    });
  });

  grid.querySelectorAll('.download-pdf-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.getAttribute('data-id');
      const doc = (appData.documents || []).find(d => d.id === id);
      if (!isServerConnected) {
        e.preventDefault();
        const offlineData = await getPdfFromIndexedDb(id);
        if (offlineData && offlineData.fileData) {
          const blobUrl = base64ToBlobUrl(offlineData.fileData);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = doc?.fileName || `${doc?.title || 'documento'}.pdf`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 100);
        }
      }
    });
  });

  grid.querySelectorAll('.edit-pdf-btn').forEach(btn => {
    btn.addEventListener('click', () => openPdfModal(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.delete-pdf-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePdf(btn.getAttribute('data-id')));
  });

  grid.querySelectorAll('.pdf-card-star-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePdfFavorite(btn.getAttribute('data-id')));
  });
}

// Helper para saltar a la biblioteca filtrada por materia desde una tarjeta
function filterPdfsByClassroom(classroomId) {
  appData.activeViewMode = 'pdfs';
  activeCareerFilter = classroomId;
  activePdfCategoryFilter = 'ALL';
  activePdfStatusFilter = 'ALL';
  saveData();
  renderAll();
  showToast('Mostrando PDFs vinculados con esta materia', 'info');
}

// --- Modales: Subir / Editar Documento PDF ---
function openPdfModal(docId = null) {
  const modal = document.getElementById('pdfModal');
  const title = document.getElementById('pdfModalTitle');
  const form = document.getElementById('pdfForm');
  const uploadGroup = document.getElementById('pdfUploadFieldGroup');
  const classroomSelect = document.getElementById('pdfClassroomId');
  const labelFile = document.getElementById('pdfSelectedFileLabel');
  const hintFile = document.getElementById('pdfSelectedFileSizeHint');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('pdfId').value = '';
  document.getElementById('pdfFileBase64').value = '';
  document.getElementById('pdfFileName').value = '';
  document.getElementById('pdfFileSize').value = '';

  // Poblar materias en el select
  if (classroomSelect) {
    classroomSelect.innerHTML = '<option value="">-- General / Transversal / Sin materia --</option>' +
      appData.classrooms.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.career)})</option>`).join('');
  }

  if (docId) {
    const doc = (appData.documents || []).find(d => d.id === docId);
    if (doc) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square text-accent"></i> Editar Documento PDF';
      document.getElementById('pdfId').value = doc.id;
      document.getElementById('pdfTitle').value = doc.title || '';
      document.getElementById('pdfClassroomId').value = doc.classroomId || '';
      document.getElementById('pdfCategory').value = doc.category || 'guia';
      document.getElementById('pdfAuthor').value = doc.author || '';
      document.getElementById('pdfReadStatus').value = doc.readStatus || 'pending';
      document.getElementById('pdfTags').value = doc.tags || '';
      document.getElementById('pdfNotes').value = doc.notes || '';
      document.getElementById('pdfIsFavorite').checked = !!doc.isFavorite;

      if (labelFile) labelFile.textContent = doc.fileName ? `Archivo actual: ${doc.fileName}` : 'Archivo PDF guardado';
      if (hintFile) hintFile.textContent = doc.fileSize ? `Tamaño: ${formatFileSize(doc.fileSize)} (Opcional: selecciona otro para reemplazar)` : '';
    }
  } else {
    title.innerHTML = '<i class="fa-solid fa-file-pdf text-danger"></i> Subir Documento PDF';
    if (labelFile) labelFile.textContent = 'Haz clic o arrastra un archivo PDF aquí';
    if (hintFile) hintFile.textContent = 'Formatos soportados: .pdf (hasta 50 MB)';
    
    // Si estamos en un filtro de materia específico, auto-seleccionarla
    if (activeCareerFilter && activeCareerFilter !== 'ALL' && activeCareerFilter !== 'GENERAL') {
      if (classroomSelect) classroomSelect.value = activeCareerFilter;
    }
  }

  modal.style.display = 'flex';
}

async function handlePdfFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('pdfId').value;
  const title = document.getElementById('pdfTitle').value.trim();
  const classroomId = document.getElementById('pdfClassroomId').value;
  const category = document.getElementById('pdfCategory').value;
  const author = document.getElementById('pdfAuthor').value.trim();
  const readStatus = document.getElementById('pdfReadStatus').value;
  const tags = document.getElementById('pdfTags').value.trim();
  const notes = document.getElementById('pdfNotes').value.trim();
  const isFavorite = document.getElementById('pdfIsFavorite').checked;
  const fileBase64 = document.getElementById('pdfFileBase64').value;
  const fileName = document.getElementById('pdfFileName').value;
  const fileSize = document.getElementById('pdfFileSize').value;

  if (!title) {
    showToast('Por favor escribe un título para el documento', 'error');
    return;
  }

  const docId = id || `doc-${Date.now()}`;

  // Si se seleccionó un archivo nuevo, guardarlo en servidor y en IndexedDB
  if (fileBase64) {
    // 1. Guardar en IndexedDB local
    await savePdfToIndexedDb(docId, fileBase64, fileName, fileSize);

    // 2. Si hay servidor activo, subir vía API
    if (isServerConnected) {
      try {
        await fetch(`${API_BASE_URL}/api/pdfs/upload`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            id: docId,
            fileName: fileName || `${title}.pdf`,
            base64: fileBase64
          })
        });
      } catch (err) {
        console.warn('[PDF] No se pudo subir al servidor, guardado localmente:', err);
      }
    }
  } else if (!id) {
    showToast('Por favor selecciona un archivo PDF para subir', 'error');
    return;
  }

  if (!appData.documents) appData.documents = [];

  if (id) {
    const idx = appData.documents.findIndex(d => d.id === id);
    if (idx !== -1) {
      const existing = appData.documents[idx];
      appData.documents[idx] = {
        ...existing,
        title,
        classroomId,
        category,
        author,
        readStatus,
        tags,
        notes,
        isFavorite,
        fileName: fileName || existing.fileName,
        fileSize: fileSize || existing.fileSize,
        updatedAt: Date.now()
      };
      showToast('Documento actualizado correctamente', 'success');
    }
  } else {
    const newDoc = {
      id: docId,
      title,
      classroomId,
      category,
      author,
      readStatus,
      tags,
      notes,
      isFavorite,
      fileName: fileName || `${title}.pdf`,
      fileSize: fileSize || '0 KB',
      createdAt: Date.now(),
      lastOpenedAt: Date.now()
    };
    appData.documents.unshift(newDoc);
    showToast('¡Documento PDF agregado a tu biblioteca!', 'success');
  }

  saveData();
  closeModal('pdfModal');
  renderAll();
}

async function deletePdf(docId) {
  const doc = (appData.documents || []).find(d => d.id === docId);
  if (!doc) return;

  if (confirm(`¿Estás seguro de que deseas eliminar "${doc.title}" de tu biblioteca?`)) {
    appData.documents = appData.documents.filter(d => d.id !== docId);

    // Eliminar de IndexedDB
    await deletePdfFromIndexedDb(docId);

    // Eliminar del servidor si está conectado
    if (isServerConnected) {
      try {
        await fetch(`${API_BASE_URL}/api/pdfs/${docId}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
      } catch (e) {
        console.warn('[PDF] Error al eliminar del servidor:', e);
      }
    }

    saveData();
    renderAll();
    showToast('Documento eliminado de la biblioteca', 'info');
  }
}

function togglePdfFavorite(docId) {
  const doc = (appData.documents || []).find(d => d.id === docId);
  if (!doc) return;
  doc.isFavorite = !doc.isFavorite;
  saveData();
  renderAll();
  showToast(doc.isFavorite ? '⭐ Añadido a favoritos' : 'Eliminado de favoritos', 'info');
}

function changePdfStatus(docId, newStatus) {
  const doc = (appData.documents || []).find(d => d.id === docId);
  if (!doc) return;
  doc.readStatus = newStatus;
  saveData();
  renderAll();
}

// --- VISOR DE PDF INTEGRADO (Lector de Estudio) ---
async function openPdfReader(docId) {
  const doc = (appData.documents || []).find(d => d.id === docId);
  if (!doc) return;

  currentReadingDocId = docId;
  doc.lastOpenedAt = Date.now();
  saveData();

  const modal = document.getElementById('pdfReaderModal');
  const iframe = document.getElementById('pdfViewerFrame');
  const loadingOverlay = document.getElementById('readerLoadingOverlay');
  const titleEl = document.getElementById('readerDocTitle');
  const catBadge = document.getElementById('readerCategoryBadge');
  const subBadge = document.getElementById('readerSubjectBadge');
  const sizeBadge = document.getElementById('readerSizeBadge');
  const statusSelect = document.getElementById('readerStatusSelect');
  const favoriteBtn = document.getElementById('readerFavoriteBtn');
  const openExternalBtn = document.getElementById('readerOpenExternalBtn');
  const downloadBtn = document.getElementById('readerDownloadBtn');
  const notesTextarea = document.getElementById('readerNotesTextarea');
  const notesIndicator = document.getElementById('readerNotesSaveIndicator');

  if (!modal || !iframe) return;

  // Actualizar metadatos del visor
  if (titleEl) titleEl.textContent = doc.title;
  if (catBadge) {
    catBadge.textContent = getPdfCategoryLabel(doc.category);
    catBadge.className = `badge ${getPdfCategoryClass(doc.category)}`;
  }
  if (subBadge) {
    const matchingClassroom = appData.classrooms.find(c => c.id === doc.classroomId);
    subBadge.textContent = matchingClassroom ? matchingClassroom.name : 'General';
  }
  if (sizeBadge) {
    sizeBadge.textContent = doc.fileSize ? (typeof doc.fileSize === 'number' ? formatFileSize(doc.fileSize) : doc.fileSize) : 'PDF';
  }
  if (statusSelect) {
    statusSelect.value = doc.readStatus || 'pending';
  }
  if (favoriteBtn) {
    favoriteBtn.className = `reader-action-btn ${doc.isFavorite ? 'is-favorite' : ''}`;
    favoriteBtn.innerHTML = `<i class="${doc.isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>`;
  }
  if (notesTextarea) {
    notesTextarea.value = doc.notes || '';
  }
  if (notesIndicator) {
    notesIndicator.textContent = 'Guardado';
    notesIndicator.classList.remove('saving');
  }

  const directFileUrl = `${API_BASE_URL}/api/pdfs/file/${doc.id}`;
  const downloadUrl = `${API_BASE_URL}/api/pdfs/file/${doc.id}?download=1&name=${encodeURIComponent(doc.fileName || doc.title + '.pdf')}`;

  if (openExternalBtn) openExternalBtn.href = directFileUrl;
  if (downloadBtn) {
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', doc.fileName || `${doc.title}.pdf`);
  }

  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  modal.style.display = 'flex';

  // Cargar PDF en el iframe
  try {
    if (isServerConnected) {
      iframe.src = `${API_BASE_URL}/api/pdfs/file/${doc.id}#toolbar=1&navpanes=1&scrollbar=1`;
    } else {
      // Modo offline: obtener desde IndexedDB
      const offlineDoc = await getPdfFromIndexedDb(doc.id);
      if (offlineDoc && offlineDoc.fileData) {
        const blobUrl = base64ToBlobUrl(offlineDoc.fileData);
        iframe.src = `${blobUrl}#toolbar=1&navpanes=1&scrollbar=1`;
        if (openExternalBtn) openExternalBtn.href = blobUrl;
        if (downloadBtn) downloadBtn.href = blobUrl;
      } else {
        iframe.src = `${API_BASE_URL}/api/pdfs/file/${doc.id}`;
      }
    }
  } catch (e) {
    console.warn('[Visor PDF] Error al cargar recurso:', e);
  }

  iframe.onload = () => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  };
  setTimeout(() => {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
  }, 1200);
}

function closePdfReader() {
  const modal = document.getElementById('pdfReaderModal');
  const iframe = document.getElementById('pdfViewerFrame');
  if (iframe) iframe.src = '';
  if (modal) modal.style.display = 'none';
  currentReadingDocId = null;
  renderPdfs();
}

function toggleReaderNotes() {
  const drawer = document.getElementById('readerNotesDrawer');
  const btn = document.getElementById('readerToggleNotesBtn');
  if (!drawer) return;
  drawer.classList.toggle('collapsed');
  if (btn) btn.classList.toggle('active-notes', !drawer.classList.contains('collapsed'));
}

function toggleReaderFullscreen() {
  const container = document.querySelector('.reader-container');
  if (container) {
    container.classList.toggle('is-fullscreen');
    const icon = document.querySelector('#readerFullscreenBtn i');
    if (icon) {
      icon.className = container.classList.contains('is-fullscreen') ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    }
  }
}

function copyReaderNotesToGlobal() {
  const notesTextarea = document.getElementById('readerNotesTextarea');
  const text = notesTextarea?.value.trim();
  if (!text) {
    showToast('No hay notas escritas para copiar', 'info');
    return;
  }

  const doc = (appData.documents || []).find(d => d.id === currentReadingDocId);
  const docHeader = doc ? `\n\n📌 [Apuntes de ${doc.title}]:\n` : '\n\n📌 [Apuntes de lectura]:\n';
  
  appData.quickNotes = (appData.quickNotes || '') + docHeader + text;
  saveData();
  renderQuickNotes();
  showToast('¡Apuntes copiados a tu Bloc de Notas general!', 'success');
}

// --- Helpers de Plataforma ---
function getPlatformLabel(platform) {
  const map = {
    moodle: 'Moodle',
    classroom: 'Classroom',
    teams: 'Teams',
    canvas: 'Canvas LMS',
    blackboard: 'Blackboard',
    zoom: 'Zoom / Meet',
    custom: 'Web'
  };
  return map[platform] || 'Aula Virtual';
}

function getPlatformIcon(platform) {
  const map = {
    moodle: 'fa-solid fa-graduation-cap',
    classroom: 'fa-solid fa-users',
    teams: 'fa-solid fa-people-group',
    canvas: 'fa-solid fa-circle-nodes',
    blackboard: 'fa-solid fa-chalkboard',
    zoom: 'fa-solid fa-video',
    custom: 'fa-solid fa-globe'
  };
  return map[platform] || 'fa-solid fa-link';
}

// --- Renderizado: Recordatorios & Tareas ---
function renderReminders() {
  const list = document.getElementById('remindersList');
  const emptyState = document.getElementById('remindersEmptyState');
  const pendingBadge = document.getElementById('pendingRemindersBadge');
  if (!list) return;

  const totalPending = appData.reminders.filter(r => !r.completed).length;
  if (pendingBadge) {
    pendingBadge.textContent = `${totalPending} ${totalPending === 1 ? 'pendiente' : 'pendientes'}`;
  }

  let filtered = [...appData.reminders];

  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const dateA = new Date(`${a.dueDate}T${a.dueTime || '23:59'}`);
    const dateB = new Date(`${b.dueDate}T${b.dueTime || '23:59'}`);
    return dateA - dateB;
  });

  const todayStr = new Date().toISOString().split('T')[0];

  if (activeReminderFilter === 'pending') {
    filtered = filtered.filter(r => !r.completed);
  } else if (activeReminderFilter === 'today') {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 3);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    filtered = filtered.filter(r => !r.completed && r.dueDate >= todayStr && r.dueDate <= maxDateStr);
  } else if (activeReminderFilter === 'completed') {
    filtered = filtered.filter(r => r.completed);
  }

  if (currentSearchQuery.trim()) {
    const q = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(r => 
      r.title.toLowerCase().includes(q) ||
      (r.details && r.details.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  list.innerHTML = filtered.map(r => {
    const associatedClassroom = appData.classrooms.find(c => c.id === r.classroomId);
    const priorityClass = `priority-${r.priority || 'medium'}`;
    const dueInfo = formatDueDateInfo(r.dueDate, r.dueTime, r.completed);

    return `
      <div class="reminder-item ${priorityClass} ${r.completed ? 'completed' : ''}" data-id="${r.id}">
        <button class="reminder-checkbox-btn toggle-reminder-btn" data-id="${r.id}" title="${r.completed ? 'Marcar como pendiente' : 'Marcar como completado'}">
          <i class="${r.completed ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
        </button>

        <div class="reminder-content">
          <div class="reminder-title">${escapeHtml(r.title)}</div>
          <div class="reminder-meta-row">
            <span class="reminder-due-tag ${dueInfo.statusClass}">
              <i class="fa-regular fa-clock"></i>
              ${dueInfo.text}
            </span>
            ${associatedClassroom ? `
              <span class="reminder-classroom-tag" title="${escapeHtml(associatedClassroom.name)}">
                <i class="fa-solid fa-book"></i> ${escapeHtml(associatedClassroom.name)}
              </span>
            ` : ''}
          </div>
          ${r.details ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">${escapeHtml(r.details)}</div>` : ''}
        </div>

        <div class="reminder-actions">
          <button class="reminder-btn-icon edit-reminder-btn" data-id="${r.id}" title="Editar Recordatorio">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="reminder-btn-icon delete-reminder-btn" data-id="${r.id}" title="Eliminar Recordatorio">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.toggle-reminder-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleReminderCompleted(btn.getAttribute('data-id')));
  });

  list.querySelectorAll('.edit-reminder-btn').forEach(btn => {
    btn.addEventListener('click', () => openReminderModal(btn.getAttribute('data-id')));
  });

  list.querySelectorAll('.delete-reminder-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteReminder(btn.getAttribute('data-id')));
  });
}

function formatDueDateInfo(dateStr, timeStr, isCompleted) {
  if (!dateStr) return { text: 'Sin fecha', statusClass: '' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = dateStr.split('-').map(Number);
  const dueDate = new Date(year, month - 1, day);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  let timeFormatted = timeStr ? ` ${timeStr}hs` : '';

  if (isCompleted) {
    return { text: `${day}/${month}${timeFormatted}`, statusClass: '' };
  }

  if (diffDays < 0) {
    return { text: `Venció hace ${Math.abs(diffDays)}d (${day}/${month})`, statusClass: 'overdue' };
  } else if (diffDays === 0) {
    return { text: `¡Hoy${timeFormatted}!`, statusClass: 'today' };
  } else if (diffDays === 1) {
    return { text: `Mañana${timeFormatted}`, statusClass: 'today' };
  } else if (diffDays <= 7) {
    return { text: `En ${diffDays} días (${day}/${month})`, statusClass: '' };
  } else {
    return { text: `${day}/${month}/${year}${timeFormatted}`, statusClass: '' };
  }
}

// --- Renderizado: Bloc de Notas Rápido ---
function renderQuickNotes() {
  const textarea = document.getElementById('quickNotesTextarea');
  if (textarea && textarea.value !== appData.quickNotes) {
    textarea.value = appData.quickNotes || '';
  }
}

// --- Renderizado: Estadísticas ---
function renderStats() {
  const totalClassrooms = document.getElementById('statsClassroomsTotal');
  const totalUrgent = document.getElementById('statsUrgentTotal');
  const totalCompleted = document.getElementById('statsCompletedTotal');

  if (totalClassrooms) totalClassrooms.textContent = appData.classrooms.length;
  if (totalUrgent) {
    const urgentCount = appData.reminders.filter(r => !r.completed && r.priority === 'high').length;
    totalUrgent.textContent = urgentCount;
  }
  if (totalCompleted) {
    const completedCount = appData.reminders.filter(r => r.completed).length;
    totalCompleted.textContent = completedCount;
  }
}

// --- Helpers para Datalists y Dropdowns dinámicos ---
function updateDatalists() {
  const careerDatalist = document.getElementById('careerSuggestions');
  const institutionDatalist = document.getElementById('institutionSuggestions');

  if (careerDatalist) {
    const careers = Array.from(new Set(appData.classrooms.map(c => c.career.trim()).filter(Boolean)));
    careerDatalist.innerHTML = careers.map(c => `<option value="${escapeHtml(c)}">`).join('');
  }

  if (institutionDatalist) {
    const instNames = Array.from(new Set(appData.institutions.map(i => i.name.trim()).filter(Boolean)));
    institutionDatalist.innerHTML = instNames.map(i => `<option value="${escapeHtml(i)}">`).join('');
  }

  const teacherDatalist = document.getElementById('teacherSuggestions');
  if (teacherDatalist) {
    const teacherNames = Array.from(new Set([
      ...(appData.teachers || []).map(t => t.name.trim()),
      ...appData.classrooms.map(c => (c.teacher || '').trim())
    ].filter(Boolean)));
    teacherDatalist.innerHTML = teacherNames.map(name => `<option value="${escapeHtml(name)}">`).join('');
  }
}

function updateReminderClassroomOptions() {
  const select = document.getElementById('reminderClassroomId');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- General / Sin materia --</option>' +
    appData.classrooms.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.career)})</option>`).join('');
  select.value = currentVal;
}

// --- Control y Sincronización de Chips de Días en el Formulario de Materias ---
function initModalDayChips() {
  const chipsContainer = document.getElementById('classroomDayChips');
  const scheduleInput = document.getElementById('classroomSchedule');
  if (!chipsContainer || !scheduleInput) return;

  chipsContainer.querySelectorAll('.day-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      updateScheduleTextFromModalChips();
    });
  });

  scheduleInput.addEventListener('input', () => {
    updateModalChipsFromScheduleText();
  });
}

function updateModalChipsFromScheduleText() {
  const scheduleInput = document.getElementById('classroomSchedule');
  const chipsContainer = document.getElementById('classroomDayChips');
  if (!scheduleInput || !chipsContainer) return;

  const currentVal = scheduleInput.value.trim();
  const detectedDays = parseDaysFromSchedule(currentVal);

  chipsContainer.querySelectorAll('.day-chip-btn').forEach(btn => {
    const day = btn.getAttribute('data-day');
    btn.classList.toggle('selected', detectedDays.includes(day));
  });
}

function updateScheduleTextFromModalChips() {
  const scheduleInput = document.getElementById('classroomSchedule');
  const chipsContainer = document.getElementById('classroomDayChips');
  if (!scheduleInput || !chipsContainer) return;

  const selectedChips = Array.from(chipsContainer.querySelectorAll('.day-chip-btn.selected'))
    .map(btn => btn.getAttribute('data-day'));

  // Extraer cualquier horario / hora existente (ej: "18:00 a 21:00 hs" o "8:40" o "18:30 - 21:30")
  const currentVal = scheduleInput.value.trim();
  let timePortion = '';
  const timeMatch = currentVal.match(/\b\d{1,2}(?::\d{2})?\s*(?:a|al|-|a las)\s*\d{1,2}(?::\d{2})?(?:\s*hs|\s*hrs)?\b/i) ||
                    currentVal.match(/\b\d{1,2}:\d{2}(?:\s*hs|\s*hrs)?\b/i);
  if (timeMatch) {
    timePortion = ' ' + timeMatch[0];
  }

  if (selectedChips.length === 0) {
    scheduleInput.value = timePortion.trim();
    return;
  }

  const shortNames = selectedChips.map(k => {
    const found = DAYS_OF_WEEK.find(d => d.key === k);
    return found ? found.short : k;
  });

  let daysString = '';
  if (shortNames.length === 1) {
    const found = DAYS_OF_WEEK.find(d => d.key === selectedChips[0]);
    daysString = found ? found.label : shortNames[0];
  } else if (shortNames.length === 2) {
    daysString = `${shortNames[0]} y ${shortNames[1]}`;
  } else {
    daysString = shortNames.slice(0, -1).join(', ') + ' y ' + shortNames[shortNames.length - 1];
  }

  scheduleInput.value = `${daysString}${timePortion}`;
}

// --- Modales: Gestión de Aulas Virtuales (Materias) ---
function openClassroomModal(classroomId = null) {
  const modal = document.getElementById('classroomModal');
  const title = document.getElementById('classroomModalTitle');
  const form = document.getElementById('classroomForm');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('classroomId').value = '';

  if (classroomId) {
    const item = appData.classrooms.find(c => c.id === classroomId);
    if (item) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Materia / Aula';
      document.getElementById('classroomId').value = item.id;
      document.getElementById('classroomName').value = item.name;
      document.getElementById('classroomInstitution').value = item.institution || '';
      document.getElementById('classroomCareer').value = item.career;
      document.getElementById('classroomPlatform').value = item.platform || 'moodle';
      document.getElementById('classroomUrl').value = item.url;
      document.getElementById('classroomGoogleUrl').value = item.googleUrl || '';
      document.getElementById('classroomMeetingUrl').value = item.meetingUrl || '';
      document.getElementById('classroomDriveUrl').value = item.driveUrl || '';
      document.getElementById('classroomSchedule').value = item.schedule || '';
      document.getElementById('classroomTeacher').value = item.teacher || '';
      document.getElementById('classroomColor').value = item.color || '#6366f1';
      document.getElementById('classroomIcon').value = item.icon || 'fa-graduation-cap';
      document.getElementById('classroomNotes').value = item.notes || '';
    }
  } else {
    title.innerHTML = '<i class="fa-solid fa-graduation-cap"></i> Nueva Materia / Aula';
    document.getElementById('classroomColor').value = '#6366f1';
    document.getElementById('classroomIcon').value = 'fa-graduation-cap';
    document.getElementById('classroomGoogleUrl').value = '';
    document.getElementById('classroomMeetingUrl').value = '';
    document.getElementById('classroomDriveUrl').value = '';
    document.getElementById('classroomSchedule').value = '';
  }

  // Sincronizar estado visual de los chips de días en el modal
  updateModalChipsFromScheduleText();

  modal.style.display = 'flex';
}

function handleClassroomFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('classroomId').value;
  const name = document.getElementById('classroomName').value.trim();
  const institution = document.getElementById('classroomInstitution').value.trim();
  const career = document.getElementById('classroomCareer').value.trim();
  const platform = document.getElementById('classroomPlatform').value;
  const url = document.getElementById('classroomUrl').value.trim();
  const googleUrl = document.getElementById('classroomGoogleUrl').value.trim();
  const meetingUrl = document.getElementById('classroomMeetingUrl').value.trim();
  const driveUrl = document.getElementById('classroomDriveUrl').value.trim();
  const schedule = document.getElementById('classroomSchedule').value.trim();
  const teacher = document.getElementById('classroomTeacher').value.trim();
  const color = document.getElementById('classroomColor').value;
  const icon = document.getElementById('classroomIcon').value;
  const notes = document.getElementById('classroomNotes').value.trim();

  if (!name || !career || !url) {
    showToast('Por favor completa los campos obligatorios', 'error');
    return;
  }

  // Auto-registrar institución si no existe
  if (institution && !appData.institutions.some(i => i.name.toLowerCase() === institution.toLowerCase())) {
    appData.institutions.push({
      id: 'inst-' + Date.now(),
      name: institution,
      campusUrl: url,
      portalUrl: '',
      icon: 'fa-building-columns',
      color: color,
      notes: '',
      createdAt: Date.now()
    });
  }

  if (id) {
    const index = appData.classrooms.findIndex(c => c.id === id);
    if (index !== -1) {
      appData.classrooms[index] = {
        ...appData.classrooms[index],
        name, institution, career, platform, url, googleUrl, meetingUrl, driveUrl, schedule, teacher, color, icon, notes
      };
      showToast('Materia actualizada con éxito', 'success');
    }
  } else {
    const newClassroom = {
      id: 'c-' + Date.now(),
      name, institution, career, platform, url, googleUrl, meetingUrl, driveUrl, schedule, teacher, color, icon, notes,
      createdAt: Date.now()
    };
    appData.classrooms.unshift(newClassroom);
    showToast('¡Nueva materia agregada!', 'success');
  }

  saveData();
  closeModal('classroomModal');
  renderAll();
}

function deleteClassroom(id) {
  const item = appData.classrooms.find(c => c.id === id);
  if (!item) return;

  if (confirm(`¿Estás seguro de que deseas eliminar "${item.name}"?`)) {
    appData.classrooms = appData.classrooms.filter(c => c.id !== id);
    saveData();
    renderAll();
    showToast('Materia eliminada', 'info');
  }
}

// --- Modales: Gestión de Instituciones (Campus General) ---
function openInstitutionModal(institutionId = null) {
  const modal = document.getElementById('institutionModal');
  const title = document.getElementById('institutionModalTitle');
  const form = document.getElementById('institutionForm');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('institutionId').value = '';

  if (institutionId) {
    const item = appData.institutions.find(i => i.id === institutionId);
    if (item) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Institución';
      document.getElementById('institutionId').value = item.id;
      document.getElementById('institutionName').value = item.name;
      document.getElementById('institutionCampusUrl').value = item.campusUrl;
      document.getElementById('institutionPortalUrl').value = item.portalUrl || '';
      document.getElementById('institutionColor').value = item.color || '#6366f1';
      document.getElementById('institutionIcon').value = item.icon || 'fa-building-columns';
      document.getElementById('institutionNotes').value = item.notes || '';
    }
  } else {
    title.innerHTML = '<i class="fa-solid fa-building-columns"></i> Nueva Institución / Campus General';
    document.getElementById('institutionColor').value = '#6366f1';
    document.getElementById('institutionIcon').value = 'fa-building-columns';
  }

  modal.style.display = 'flex';
}

function handleInstitutionFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('institutionId').value;
  const name = document.getElementById('institutionName').value.trim();
  const campusUrl = document.getElementById('institutionCampusUrl').value.trim();
  const portalUrl = document.getElementById('institutionPortalUrl').value.trim();
  const color = document.getElementById('institutionColor').value;
  const icon = document.getElementById('institutionIcon').value;
  const notes = document.getElementById('institutionNotes').value.trim();

  if (!name || !campusUrl) {
    showToast('Por favor completa el nombre y enlace del campus', 'error');
    return;
  }

  if (id) {
    const index = appData.institutions.findIndex(i => i.id === id);
    if (index !== -1) {
      const oldName = appData.institutions[index].name;
      appData.institutions[index] = {
        ...appData.institutions[index],
        name, campusUrl, portalUrl, color, icon, notes
      };
      // Actualizar materias asociadas si cambió el nombre
      if (oldName !== name) {
        appData.classrooms.forEach(c => {
          if (c.institution === oldName) c.institution = name;
        });
      }
      showToast('Institución actualizada con éxito', 'success');
    }
  } else {
    const newInstitution = {
      id: 'inst-' + Date.now(),
      name, campusUrl, portalUrl, color, icon, notes,
      createdAt: Date.now()
    };
    appData.institutions.unshift(newInstitution);
    showToast('¡Nueva institución agregada!', 'success');
  }

  saveData();
  closeModal('institutionModal');
  renderAll();
}

function deleteInstitution(id) {
  const item = appData.institutions.find(i => i.id === id);
  if (!item) return;

  if (confirm(`¿Estás seguro de que deseas eliminar "${item.name}"? (Las materias asociadas no serán borradas).`)) {
    appData.institutions = appData.institutions.filter(i => i.id !== id);
    saveData();
    renderAll();
    showToast('Institución eliminada', 'info');
  }
}

// --- Modales: Gestión de Profesores / Contacto Docente ---
function updateTeacherModalSuggestions() {
  const instDatalist = document.getElementById('teacherInstitutionSuggestions');
  const subjectDatalist = document.getElementById('teacherSubjectSuggestions');

  if (instDatalist) {
    const insts = Array.from(new Set([
      ...appData.institutions.map(i => i.name.trim()),
      ...appData.classrooms.map(c => (c.institution || '').trim())
    ].filter(Boolean)));
    instDatalist.innerHTML = insts.map(i => `<option value="${escapeHtml(i)}">`).join('');
  }

  if (subjectDatalist) {
    const subjects = Array.from(new Set(appData.classrooms.map(c => c.name.trim()).filter(Boolean)));
    subjectDatalist.innerHTML = subjects.map(s => `<option value="${escapeHtml(s)}">`).join('');
  }
}

function openTeacherModal(teacherId = null) {
  const modal = document.getElementById('teacherModal');
  const title = document.getElementById('teacherModalTitle');
  const form = document.getElementById('teacherForm');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('teacherId').value = '';

  updateTeacherModalSuggestions();

  if (teacherId) {
    const item = (appData.teachers || []).find(t => t.id === teacherId);
    if (item) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Profesor';
      document.getElementById('teacherId').value = item.id;
      document.getElementById('teacherName').value = item.name;
      document.getElementById('teacherEmail').value = item.email || '';
      document.getElementById('teacherPhone').value = item.phone || '';
      document.getElementById('teacherInstitution').value = item.institution || '';
      document.getElementById('teacherSubject').value = item.subject || '';
      document.getElementById('teacherOfficeHours').value = item.officeHours || '';
      document.getElementById('teacherMeetUrl').value = item.meetUrl || '';
      document.getElementById('teacherColor').value = item.color || '#6366f1';
      document.getElementById('teacherIcon').value = item.icon || 'fa-chalkboard-user';
      document.getElementById('teacherNotes').value = item.notes || '';
    }
  } else {
    title.innerHTML = '<i class="fa-solid fa-user-plus"></i> Nuevo Profesor / Contacto';
    document.getElementById('teacherColor').value = '#6366f1';
    document.getElementById('teacherIcon').value = 'fa-chalkboard-user';
  }

  modal.style.display = 'flex';
}

function handleTeacherFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('teacherId').value;
  const name = document.getElementById('teacherName').value.trim();
  const email = document.getElementById('teacherEmail').value.trim();
  const phone = document.getElementById('teacherPhone').value.trim();
  const institution = document.getElementById('teacherInstitution').value.trim();
  const subject = document.getElementById('teacherSubject').value.trim();
  const officeHours = document.getElementById('teacherOfficeHours').value.trim();
  const meetUrl = document.getElementById('teacherMeetUrl').value.trim();
  const color = document.getElementById('teacherColor').value;
  const icon = document.getElementById('teacherIcon').value;
  const notes = document.getElementById('teacherNotes').value.trim();

  if (!name) {
    showToast('Por favor ingresa el nombre del profesor', 'error');
    return;
  }

  if (!appData.teachers) appData.teachers = [];

  if (id) {
    const index = appData.teachers.findIndex(t => t.id === id);
    if (index !== -1) {
      appData.teachers[index] = {
        ...appData.teachers[index],
        name, email, phone, institution, subject, officeHours, meetUrl, color, icon, notes
      };
      showToast('Profesor actualizado con éxito', 'success');
    }
  } else {
    const newTeacher = {
      id: 't-' + Date.now(),
      name, email, phone, institution, subject, officeHours, meetUrl, color, icon, notes,
      createdAt: Date.now()
    };
    appData.teachers.unshift(newTeacher);
    showToast('¡Profesor agregado al directorio!', 'success');
  }

  saveData();
  closeModal('teacherModal');
  renderAll();
}

function deleteTeacher(id) {
  const item = (appData.teachers || []).find(t => t.id === id);
  if (!item) return;

  if (confirm(`¿Estás seguro de que deseas eliminar a "${item.name}" del directorio de profesores?`)) {
    appData.teachers = (appData.teachers || []).filter(t => t.id !== id);
    saveData();
    renderAll();
    showToast('Profesor eliminado', 'info');
  }
}

// --- Modales: Gestión de Recordatorios ---
function openReminderModal(reminderId = null) {
  const modal = document.getElementById('reminderModal');
  const title = document.getElementById('reminderModalTitle');
  const form = document.getElementById('reminderForm');
  if (!modal || !form) return;

  updateReminderClassroomOptions();
  form.reset();
  document.getElementById('reminderId').value = '';

  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById('reminderDueDate').value = todayStr;
  document.getElementById('reminderDueTime').value = '23:59';

  if (reminderId) {
    const item = appData.reminders.find(r => r.id === reminderId);
    if (item) {
      title.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Recordatorio';
      document.getElementById('reminderId').value = item.id;
      document.getElementById('reminderTitle').value = item.title;
      document.getElementById('reminderClassroomId').value = item.classroomId || '';
      document.getElementById('reminderPriority').value = item.priority || 'medium';
      document.getElementById('reminderDueDate').value = item.dueDate;
      document.getElementById('reminderDueTime').value = item.dueTime || '23:59';
      document.getElementById('reminderDetails').value = item.details || '';
    }
  } else {
    title.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Nuevo Recordatorio';
  }

  modal.style.display = 'flex';
}

function handleReminderFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('reminderId').value;
  const title = document.getElementById('reminderTitle').value.trim();
  const classroomId = document.getElementById('reminderClassroomId').value;
  const priority = document.getElementById('reminderPriority').value;
  const dueDate = document.getElementById('reminderDueDate').value;
  const dueTime = document.getElementById('reminderDueTime').value;
  const details = document.getElementById('reminderDetails').value.trim();

  if (!title || !dueDate) {
    showToast('Por favor ingresa un título y fecha límite', 'error');
    return;
  }

  if (id) {
    const index = appData.reminders.findIndex(r => r.id === id);
    if (index !== -1) {
      appData.reminders[index] = {
        ...appData.reminders[index],
        title, classroomId, priority, dueDate, dueTime, details
      };
      showToast('Recordatorio actualizado', 'success');
    }
  } else {
    const newReminder = {
      id: 'r-' + Date.now(),
      title, classroomId, priority, dueDate, dueTime, details,
      completed: false,
      createdAt: Date.now()
    };
    appData.reminders.unshift(newReminder);
    showToast('Recordatorio programado', 'success');
  }

  saveData();
  closeModal('reminderModal');
  renderAll();
}

function toggleReminderCompleted(id) {
  const item = appData.reminders.find(r => r.id === id);
  if (item) {
    item.completed = !item.completed;
    saveData();
    renderReminders();
    renderStats();
    showToast(item.completed ? '¡Tarea completada! 🎉' : 'Tarea marcada como pendiente', 'info');
  }
}

function deleteReminder(id) {
  appData.reminders = appData.reminders.filter(r => r.id !== id);
  saveData();
  renderReminders();
  renderStats();
  showToast('Recordatorio eliminado', 'info');
}

// --- Modales: Gestión de Enlaces Rápidos ---
function openQuickLinksModal() {
  const modal = document.getElementById('quickLinkModal');
  if (!modal) return;
  renderQuickLinksManagementList();
  modal.style.display = 'flex';
}

function renderQuickLinksManagementList() {
  const list = document.getElementById('quickLinksManagementList');
  if (!list) return;

  if (appData.quickLinks.length === 0) {
    list.innerHTML = '<p class="text-secondary" style="font-size: 0.82rem;">No hay enlaces configurados.</p>';
    return;
  }

  list.innerHTML = appData.quickLinks.map(link => `
    <div class="ql-manage-item">
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="fa-solid ${escapeHtml(link.icon || 'fa-link')} text-accent"></i>
        <strong>${escapeHtml(link.title)}</strong>
        <span class="text-muted" style="font-size: 0.74rem;">(${escapeHtml(link.url)})</span>
      </div>
      <button class="btn-icon-secondary delete-ql-btn" data-id="${link.id}" title="Eliminar enlace" style="width: 28px; height: 28px;">
        <i class="fa-solid fa-trash-can" style="font-size: 0.72rem;"></i>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.delete-ql-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      appData.quickLinks = appData.quickLinks.filter(l => l.id !== id);
      saveData();
      renderQuickLinks();
      renderQuickLinksManagementList();
      showToast('Enlace eliminado', 'info');
    });
  });
}

function handleQuickLinkFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('qlTitle').value.trim();
  const icon = document.getElementById('qlIcon').value;
  const url = document.getElementById('qlUrl').value.trim();

  if (!title || !url) return;

  const newLink = {
    id: 'ql-' + Date.now(),
    title, icon, url
  };

  appData.quickLinks.push(newLink);
  saveData();
  document.getElementById('quickLinkForm').reset();
  renderQuickLinks();
  renderQuickLinksManagementList();
  showToast('Enlace rápido agregado', 'success');
}

// --- Configuración y Estado de Notificaciones Diarias Automáticas ---
let notificationConfig = {
  enabled: false,
  channel: 'both', // 'email' | 'telegram' | 'both'
  time: '07:00',
  lastSentDate: '',
  email: {
    service: 'gmail',
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

async function fetchNotificationConfig() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/config`, {
      headers: getAuthHeaders({ 'Accept': 'application/json' })
    });
    if (res.ok) {
      const data = await res.json();
      notificationConfig = {
        ...notificationConfig,
        ...data,
        email: { ...notificationConfig.email, ...(data.email || {}) },
        telegram: { ...notificationConfig.telegram, ...(data.telegram || {}) }
      };
      updateNotificationUI();
    }
  } catch (err) {
    console.info('[Notificaciones] Servidor local no disponible para leer configuración:', err.message);
  }
}

function updateNotificationUI() {
  const enabledToggle = document.getElementById('notifEnabledToggle');
  const configFields = document.getElementById('notifConfigFields');
  const statusBadge = document.getElementById('notifStatusBadge');
  const timeInput = document.getElementById('notifTimeInput');
  const lastSentDisplay = document.getElementById('notifLastSentDisplay');
  const channelVal = document.getElementById('notifChannelVal');

  if (enabledToggle) enabledToggle.checked = !!notificationConfig.enabled;
  if (configFields) configFields.style.display = notificationConfig.enabled ? 'flex' : 'none';

  if (statusBadge) {
    if (notificationConfig.enabled) {
      statusBadge.textContent = 'Activo';
      statusBadge.className = 'badge badge-success';
    } else {
      statusBadge.textContent = 'Inactivo';
      statusBadge.className = 'badge';
    }
  }

  if (timeInput) timeInput.value = notificationConfig.time || '07:00';
  if (lastSentDisplay) {
    lastSentDisplay.value = notificationConfig.lastSentDate ? `Enviado el ${notificationConfig.lastSentDate}` : 'Ninguno todavía';
  }

  // Canal seleccionado
  const currentChannel = notificationConfig.channel || 'both';
  if (channelVal) channelVal.value = currentChannel;
  document.querySelectorAll('.notif-channel-pill').forEach(pill => {
    const ch = pill.getAttribute('data-channel');
    pill.classList.toggle('active', ch === currentChannel);
  });

  // Mostrar / Ocultar tarjetas según canal
  const emailCard = document.getElementById('notifEmailCard');
  const telegramCard = document.getElementById('notifTelegramCard');
  if (emailCard) {
    emailCard.style.display = (currentChannel === 'email' || currentChannel === 'both') ? 'flex' : 'none';
  }
  if (telegramCard) {
    telegramCard.style.display = (currentChannel === 'telegram' || currentChannel === 'both') ? 'flex' : 'none';
  }

  // Rellenar Email
  const email = notificationConfig.email || {};
  const emailService = document.getElementById('notifEmailService');
  const emailUser = document.getElementById('notifEmailUser');
  const emailPass = document.getElementById('notifEmailPass');
  const emailTo = document.getElementById('notifEmailTo');
  const emailHost = document.getElementById('notifEmailHost');
  const emailPort = document.getElementById('notifEmailPort');
  const emailSecure = document.getElementById('notifEmailSecure');

  if (emailService) emailService.value = email.service || 'gmail';
  if (emailUser) emailUser.value = email.user || '';
  if (emailPass) emailPass.value = email.pass || '';
  if (emailTo) emailTo.value = email.to || '';
  if (emailHost) emailHost.value = email.host || 'smtp.gmail.com';
  if (emailPort) emailPort.value = email.port || 465;
  if (emailSecure) emailSecure.checked = email.secure !== false;

  // Rellenar Telegram
  const tg = notificationConfig.telegram || {};
  const tgToken = document.getElementById('notifTelegramToken');
  const tgChatId = document.getElementById('notifTelegramChatId');

  if (tgToken) tgToken.value = tg.botToken || '';
  if (tgChatId) tgChatId.value = tg.chatId || '';
}

function getNotificationConfigFromUI() {
  const enabled = document.getElementById('notifEnabledToggle')?.checked ?? false;
  const channel = document.getElementById('notifChannelVal')?.value || 'both';
  const time = document.getElementById('notifTimeInput')?.value || '07:00';
  
  const service = document.getElementById('notifEmailService')?.value || 'gmail';
  const emailUser = document.getElementById('notifEmailUser')?.value.trim() || '';
  const emailPass = document.getElementById('notifEmailPass')?.value.trim() || '';
  const emailTo = document.getElementById('notifEmailTo')?.value.trim() || '';
  const emailHost = document.getElementById('notifEmailHost')?.value.trim() || 'smtp.gmail.com';
  const emailPort = parseInt(document.getElementById('notifEmailPort')?.value, 10) || 465;
  const emailSecure = document.getElementById('notifEmailSecure')?.checked ?? true;

  const botToken = document.getElementById('notifTelegramToken')?.value.trim() || '';
  const chatId = document.getElementById('notifTelegramChatId')?.value.trim() || '';

  return {
    ...notificationConfig,
    enabled,
    channel,
    time,
    email: {
      service,
      host: emailHost,
      port: emailPort,
      secure: emailSecure,
      user: emailUser,
      pass: emailPass,
      to: emailTo
    },
    telegram: {
      botToken,
      chatId
    }
  };
}

async function saveNotificationConfig(cfg = null) {
  const configToSave = cfg || getNotificationConfigFromUI();
  notificationConfig = configToSave;

  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/config`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(configToSave)
    });
    if (res.ok) {
      const result = await res.json();
      if (result.config) {
        notificationConfig = result.config;
      }
      return true;
    }
  } catch (err) {
    console.error('[Notificaciones] Error al guardar configuración en servidor:', err);
  }
  return false;
}

async function testNotification(targetChannel) {
  const cfg = getNotificationConfigFromUI();

  if (targetChannel === 'email' || targetChannel === 'both') {
    if (!cfg.email.user || !cfg.email.pass) {
      showToast('Ingresa tu correo y contraseña de aplicación para probar el email', 'error');
      return;
    }
  }

  if (targetChannel === 'telegram' || targetChannel === 'both') {
    if (!cfg.telegram.botToken || !cfg.telegram.chatId) {
      showToast('Ingresa el Bot Token y el Chat ID para probar Telegram', 'error');
      return;
    }
  }

  const channelLabel = targetChannel === 'both' ? 'Correo y Telegram' : (targetChannel === 'email' ? 'Correo' : 'Telegram');
  showToast(`Enviando prueba a ${channelLabel}...`, 'info');

  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/test`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ channel: targetChannel, config: cfg })
    });

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(text || `Error ${res.status}: ${res.statusText}`);
    }

    if (res.ok && data.success) {
      const results = data.results;
      let successCount = 0;

      if (results.email) {
        if (results.email.success) {
          showToast('✅ Correo de prueba enviado exitosamente', 'success');
          successCount++;
        } else {
          showToast(`❌ Error al enviar Correo: ${results.email.error}`, 'error');
        }
      }

      if (results.telegram) {
        if (results.telegram.success) {
          showToast('✅ Mensaje de prueba enviado a Telegram', 'success');
          successCount++;
        } else {
          showToast(`❌ Error en Telegram: ${results.telegram.error}`, 'error');
        }
      }

      if (successCount > 0) {
        // Auto-guardar configuración validada
        await saveNotificationConfig(cfg);
      }
    } else {
      showToast(data.error || 'Error al ejecutar prueba de envío', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function sendDailySummaryNow() {
  showToast('Despachando resumen del día de hoy...', 'info');
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/send-now`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' })
    });

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      throw new Error(text || `Error ${res.status}: ${res.statusText}`);
    }

    if (res.ok && data.success) {
      showToast('🚀 ¡Resumen diario enviado con éxito!', 'success');
      await fetchNotificationConfig();
    } else {
      showToast(data.error || 'No se pudo enviar el resumen', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// --- Modales: Configuración & Backup ---
function openSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (!modal) return;
  document.getElementById('userNameInput').value = appData.userName || '';
  updateSecuritySettingsUI();
  fetchNotificationConfig();
  modal.style.display = 'flex';
}

async function saveSettings() {
  const name = document.getElementById('userNameInput').value.trim();
  appData.userName = name;
  saveData();
  initClockAndDate();
  
  // Guardar configuración de notificaciones
  await saveNotificationConfig();

  closeModal('settingsModal');
  showToast('Configuración guardada exitosamente', 'success');
}

function exportData() {
  const jsonStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `backup_campus_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Copia de seguridad descargada', 'success');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.classrooms && Array.isArray(imported.classrooms)) {
        appData = { ...DEFAULT_SAMPLE_DATA, ...imported };
        saveData();
        initTheme();
        renderAll();
        closeModal('settingsModal');
        showToast('¡Datos importados exitosamente!', 'success');
      } else {
        showToast('El archivo no contiene un formato de respaldo válido', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error al leer el archivo JSON', 'error');
    }
  };
  reader.readAsText(file);
}

function loadSampleData() {
  if (confirm('¿Deseas restaurar los datos de ejemplo? Esto reemplazará tus aulas e instituciones actuales.')) {
    appData = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_DATA));
    saveData();
    renderAll();
    closeModal('settingsModal');
    showToast('Datos de ejemplo cargados', 'success');
  }
}

function resetAllData() {
  if (confirm('⚠️ ¿Estás seguro de que quieres borrar todos los datos? Esta acción es irreversible.')) {
    appData = {
      userName: '',
      theme: 'dark',
      activeViewMode: 'subjects',
      quickNotes: '',
      quickLinks: [],
      institutions: [],
      classrooms: [],
      reminders: [],
      teachers: []
    };
    saveData();
    renderAll();
    closeModal('settingsModal');
    showToast('Se han eliminado todos los datos', 'info');
  }
}

// ==========================================================================
// CENTRO DE EXPORTACIÓN ACADÉMICA (Panorama General, Diario y Semanal)
// ==========================================================================

const exportState = {
  scope: 'general', // 'general' | 'daily' | 'weekly'
  day: 'today',     // 'today' | 'lunes' | ... | 'domingo'
  tab: 'html',      // 'html' | 'text'
  options: {
    links: true,
    teachers: true,
    reminders: true,
    notes: true
  }
};

function getEffectiveExportDay() {
  if (exportState.day === 'today') {
    return getTodayDayKey();
  }
  return exportState.day;
}

function openExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  updateExportUIFromState();
  updateExportPreview();
  modal.style.display = 'flex';
}

function updateExportUIFromState() {
  // Update Scope Cards
  document.querySelectorAll('.export-scope-card').forEach(card => {
    const scope = card.getAttribute('data-scope');
    card.classList.toggle('active', scope === exportState.scope);
  });

  // Day Selector visibility
  const daySec = document.getElementById('exportDaySelectorSection');
  if (daySec) {
    daySec.style.display = (exportState.scope === 'daily') ? 'flex' : 'none';
  }

  // Day Pills
  document.querySelectorAll('.export-day-pill').forEach(pill => {
    const day = pill.getAttribute('data-day');
    pill.classList.toggle('active', day === exportState.day);
  });

  // Options toggles
  const optLinks = document.getElementById('exportOptLinks');
  const optTeachers = document.getElementById('exportOptTeachers');
  const optReminders = document.getElementById('exportOptReminders');
  const optNotes = document.getElementById('exportOptNotes');
  if (optLinks) optLinks.checked = exportState.options.links;
  if (optTeachers) optTeachers.checked = exportState.options.teachers;
  if (optReminders) optReminders.checked = exportState.options.reminders;
  if (optNotes) optNotes.checked = exportState.options.notes;

  // Tabs
  const tabHtml = document.getElementById('exportTabHtml');
  const tabText = document.getElementById('exportTabText');
  const viewHtml = document.getElementById('exportPreviewHtmlView');
  const viewText = document.getElementById('exportPreviewTextView');
  if (tabHtml && tabText && viewHtml && viewText) {
    tabHtml.classList.toggle('active', exportState.tab === 'html');
    tabText.classList.toggle('active', exportState.tab === 'text');
    viewHtml.style.display = (exportState.tab === 'html') ? 'block' : 'none';
    viewText.style.display = (exportState.tab === 'text') ? 'block' : 'none';
  }
}

function getExportDataset() {
  const effectiveDay = getEffectiveExportDay();
  const dayObj = DAYS_OF_WEEK.find(d => d.key === effectiveDay);
  const dayName = dayObj ? dayObj.label : 'Hoy';

  const classrooms = appData.classrooms || [];
  const institutions = appData.institutions || [];
  const teachers = appData.teachers || [];
  const reminders = (appData.reminders || []).filter(r => !r.completed);
  const user = appData.userName || 'Estudiante';
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (exportState.scope === 'daily') {
    const filteredClassrooms = classrooms.filter(c => {
      const days = parseDaysFromSchedule(c.schedule);
      return days.includes(effectiveDay);
    });

    const classroomIds = filteredClassrooms.map(c => c.id);
    const relatedReminders = reminders.filter(r => !r.classroomId || classroomIds.includes(r.classroomId));

    return {
      scope: 'daily',
      title: `Panorama Diario - ${dayName}`,
      subtitle: `Agenda y clases para ${dayName} (${dateFormatted})`,
      dayKey: effectiveDay,
      dayName,
      dateFormatted,
      userName: user,
      classrooms: filteredClassrooms,
      institutions,
      teachers,
      reminders: relatedReminders
    };
  }

  if (exportState.scope === 'weekly') {
    const weeklySchedule = DAYS_OF_WEEK.map(d => {
      const dayClassrooms = classrooms.filter(c => {
        const days = parseDaysFromSchedule(c.schedule);
        return days.includes(d.key);
      });
      return {
        dayKey: d.key,
        dayName: d.label,
        short: d.short,
        classrooms: dayClassrooms
      };
    });

    return {
      scope: 'weekly',
      title: `Panorama Semanal Académico`,
      subtitle: `Cronograma de cursada de Lunes a Domingo`,
      dateFormatted,
      userName: user,
      weeklySchedule,
      institutions,
      teachers,
      reminders
    };
  }

  // General scope
  return {
    scope: 'general',
    title: `Panorama General Académico`,
    subtitle: `Resumen completo de instituciones, materias, enlaces y recursos`,
    dateFormatted,
    userName: user,
    classrooms,
    institutions,
    teachers,
    reminders,
    quickLinks: appData.quickLinks || []
  };
}

function updateExportPreview() {
  const dataset = getExportDataset();
  const badge = document.getElementById('exportPreviewBadge');
  if (badge) {
    if (exportState.scope === 'general') badge.textContent = 'Panorama General';
    if (exportState.scope === 'daily') badge.textContent = `Diario (${dataset.dayName})`;
    if (exportState.scope === 'weekly') badge.textContent = 'Panorama Semanal';
  }

  const htmlView = document.getElementById('exportPreviewHtmlView');
  const textView = document.getElementById('exportPreviewTextView');

  if (htmlView) {
    let previewContent = '';
    if (exportState.scope === 'daily') {
      const classrooms = dataset.classrooms || [];
      previewContent += `
        <h3 style="color: var(--accent); margin-bottom: 8px;">Agenda de ${escapeHtml(dataset.dayName)} (${classrooms.length} ${classrooms.length === 1 ? 'clase' : 'clases'})</h3>
        ${classrooms.length > 0 ? classrooms.map(c => `
          <div class="prev-item-card">
            <div class="prev-item-title">
              <span>${escapeHtml(c.name)}</span>
              <span style="color: var(--accent); font-size: 0.72rem;">${escapeHtml(c.schedule || '')}</span>
            </div>
            ${c.teacher ? `<div style="font-size: 0.74rem; color: var(--text-muted);">👨‍🏫 ${escapeHtml(c.teacher)}</div>` : ''}
            ${exportState.options.links ? `
              <div class="prev-links-row">
                <span class="prev-link-pill" style="background: rgba(99,102,241,0.2); color: #818cf8;">🔗 Aula</span>
                ${c.googleUrl ? `<span class="prev-link-pill" style="background: rgba(22,163,74,0.2); color: #4ade80;">📚 Classroom</span>` : ''}
                ${c.meetingUrl ? `<span class="prev-link-pill" style="background: rgba(2,132,199,0.2); color: #38bdf8;">📹 Meet</span>` : ''}
                ${c.driveUrl ? `<span class="prev-link-pill" style="background: rgba(16,185,129,0.2); color: #34d399;">📁 Drive</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('') : '<p style="color: var(--text-muted); font-style: italic;">Sin clases este día.</p>'}
      `;
    } else if (exportState.scope === 'weekly') {
      const weeklySchedule = dataset.weeklySchedule || [];
      previewContent += `<h3 style="color: var(--accent); margin-bottom: 8px;">Cronograma Semanal de Cursada</h3>`;
      previewContent += weeklySchedule.map(day => `
        <div class="prev-item-card" style="margin-bottom: 6px;">
          <div class="prev-item-title">
            <strong>📅 ${escapeHtml(day.dayName)}</strong>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${day.classrooms.length} materias</span>
          </div>
          ${day.classrooms.length > 0 ? `
            <div style="font-size: 0.75rem; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
              ${day.classrooms.map(c => `<div>&bull; <strong>${escapeHtml(c.name)}</strong> <span style="color: var(--accent);">(${escapeHtml(c.schedule || '')})</span></div>`).join('')}
            </div>
          ` : '<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">Sin clases</span>'}
        </div>
      `).join('');
    } else {
      // General
      const classrooms = dataset.classrooms || [];
      previewContent += `
        <h3 style="color: var(--accent); margin-bottom: 8px;">Panorama General Académico (${classrooms.length} materias)</h3>
        ${classrooms.map(c => `
          <div class="prev-item-card">
            <div class="prev-item-title">
              <span>${escapeHtml(c.name)}</span>
              <span style="color: var(--accent); font-size: 0.72rem;">${escapeHtml(c.schedule || '')}</span>
            </div>
            ${c.institution ? `<div style="font-size: 0.74rem; color: var(--text-muted);">🏛️ ${escapeHtml(c.institution)}</div>` : ''}
            ${c.teacher ? `<div style="font-size: 0.74rem; color: var(--text-muted);">👨‍🏫 ${escapeHtml(c.teacher)}</div>` : ''}
          </div>
        `).join('')}
      `;
    }

    if (exportState.options.reminders && (dataset.reminders || []).length > 0) {
      previewContent += `
        <h4 style="color: #f59e0b; margin-top: 10px; margin-bottom: 4px; font-size: 0.8rem;">📌 Entregas y Recordatorios (${dataset.reminders.length})</h4>
        ${dataset.reminders.map(r => `
          <div style="font-size: 0.74rem; color: var(--text-secondary); margin-bottom: 2px;">
            &bull; <strong>${escapeHtml(r.title)}</strong> ${r.dueDate ? `(${escapeHtml(r.dueDate)})` : ''}
          </div>
        `).join('')}
      `;
    }

    htmlView.innerHTML = previewContent;
  }

  if (textView) {
    textView.value = generatePlainText(dataset, exportState.options);
  }
}

function generateStandaloneHtml(data, options) {
  const { title, subtitle, dateFormatted, userName, scope } = data;

  let contentHtml = '';

  if (scope === 'daily') {
    const classrooms = data.classrooms || [];
    contentHtml += `
      <section class="export-section">
        <h2 class="section-title">📚 Clases del Día (${classrooms.length})</h2>
        ${classrooms.length > 0 ? `
          <div class="cards-grid">
            ${classrooms.map(c => `
              <div class="card" style="border-top: 4px solid ${c.color || '#6366f1'};">
                <div class="card-header">
                  <span class="badge badge-career">${escapeHtml(c.career || 'Materia')}</span>
                  <span class="badge badge-platform">${escapeHtml(c.platform || 'Campus')}</span>
                </div>
                <h3 class="card-title">${escapeHtml(c.name)}</h3>
                ${c.institution ? `<p class="meta-item"><i class="icon">🏛️</i> ${escapeHtml(c.institution)}</p>` : ''}
                ${c.schedule ? `<p class="meta-item"><i class="icon">🕒</i> <strong>${escapeHtml(c.schedule)}</strong></p>` : ''}
                ${options.teachers && c.teacher ? `<p class="meta-item"><i class="icon">👨‍🏫</i> ${escapeHtml(c.teacher)}</p>` : ''}
                ${options.notes && c.notes ? `<p class="notes-box">🔑 ${escapeHtml(c.notes)}</p>` : ''}
                ${options.links ? `
                  <div class="card-actions">
                    <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="btn btn-primary">🔗 Ingresar al Aula</a>
                    ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" rel="noopener" class="btn btn-classroom">📚 Classroom</a>` : ''}
                    ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" rel="noopener" class="btn btn-meet">📹 Meet / Zoom</a>` : ''}
                    ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" rel="noopener" class="btn btn-drive">📁 Drive</a>` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-box">
            <p>🎉 No tienes clases programadas para este día.</p>
          </div>
        `}
      </section>
    `;
  } else if (scope === 'weekly') {
    const weeklySchedule = data.weeklySchedule || [];
    contentHtml += `
      <section class="export-section">
        <h2 class="section-title">🗓️ Cronograma Semanal</h2>
        <div class="weekly-grid">
          ${weeklySchedule.map(day => `
            <div class="weekly-day-column ${day.classrooms.length > 0 ? 'has-classes' : 'empty-day'}">
              <div class="day-header">
                <h3>${escapeHtml(day.dayName)}</h3>
                <span class="day-count-badge">${day.classrooms.length} ${day.classrooms.length === 1 ? 'materia' : 'materias'}</span>
              </div>
              <div class="day-classes-list">
                ${day.classrooms.length > 0 ? day.classrooms.map(c => `
                  <div class="weekly-card" style="border-left: 4px solid ${c.color || '#6366f1'};">
                    <h4 class="weekly-card-title">${escapeHtml(c.name)}</h4>
                    <p class="weekly-card-time">🕒 ${escapeHtml(c.schedule || '')}</p>
                    ${options.teachers && c.teacher ? `<p class="weekly-card-meta">👨‍🏫 ${escapeHtml(c.teacher)}</p>` : ''}
                    ${options.links ? `
                      <div class="weekly-links-row">
                        <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="mini-link mini-link-campus" title="Aula">Aula</a>
                        ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" rel="noopener" class="mini-link mini-link-classroom" title="Classroom">Classroom</a>` : ''}
                        ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" rel="noopener" class="mini-link mini-link-meet" title="Meet">Meet</a>` : ''}
                        ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" rel="noopener" class="mini-link mini-link-drive" title="Drive">Drive</a>` : ''}
                      </div>
                    ` : ''}
                  </div>
                `).join('') : `
                  <div class="weekly-empty-day">Sin clases</div>
                `}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  } else {
    // Panorama General
    const institutions = data.institutions || [];
    const classrooms = data.classrooms || [];
    const teachers = data.teachers || [];
    const quickLinks = data.quickLinks || [];

    if (quickLinks.length > 0 && options.links) {
      contentHtml += `
        <section class="export-section">
          <h2 class="section-title">⚡ Enlaces Rápidos</h2>
          <div class="quick-links-grid">
            ${quickLinks.map(l => `
              <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="quick-link-item">
                <span>🔗 ${escapeHtml(l.title)}</span>
              </a>
            `).join('')}
          </div>
        </section>
      `;
    }

    if (institutions.length > 0) {
      contentHtml += `
        <section class="export-section">
          <h2 class="section-title">🏛️ Instituciones y Campus</h2>
          <div class="cards-grid">
            ${institutions.map(inst => `
              <div class="card" style="border-top: 4px solid ${inst.color || '#10b981'};">
                <h3 class="card-title">${escapeHtml(inst.name)}</h3>
                ${options.notes && inst.notes ? `<p class="notes-box">🔑 ${escapeHtml(inst.notes)}</p>` : ''}
                ${options.links ? `
                  <div class="card-actions">
                    <a href="${escapeHtml(inst.campusUrl)}" target="_blank" rel="noopener" class="btn btn-primary">🌐 Campus Principal</a>
                    ${inst.portalUrl ? `<a href="${escapeHtml(inst.portalUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">👤 Portal Alumnos</a>` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }

    contentHtml += `
      <section class="export-section">
        <h2 class="section-title">📚 Todas las Materias (${classrooms.length})</h2>
        <div class="cards-grid">
          ${classrooms.map(c => `
            <div class="card" style="border-top: 4px solid ${c.color || '#6366f1'};">
              <div class="card-header">
                <span class="badge badge-career">${escapeHtml(c.career || 'Materia')}</span>
                <span class="badge badge-platform">${escapeHtml(c.platform || 'Campus')}</span>
              </div>
              <h3 class="card-title">${escapeHtml(c.name)}</h3>
              ${c.institution ? `<p class="meta-item"><i class="icon">🏛️</i> ${escapeHtml(c.institution)}</p>` : ''}
              ${c.schedule ? `<p class="meta-item"><i class="icon">🕒</i> <strong>${escapeHtml(c.schedule)}</strong></p>` : ''}
              ${options.teachers && c.teacher ? `<p class="meta-item"><i class="icon">👨‍🏫</i> ${escapeHtml(c.teacher)}</p>` : ''}
              ${options.notes && c.notes ? `<p class="notes-box">🔑 ${escapeHtml(c.notes)}</p>` : ''}
              ${options.links ? `
                <div class="card-actions">
                  <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" class="btn btn-primary">🔗 Ingresar al Aula</a>
                  ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" rel="noopener" class="btn btn-classroom">📚 Classroom</a>` : ''}
                  ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" rel="noopener" class="btn btn-meet">📹 Meet / Zoom</a>` : ''}
                  ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" rel="noopener" class="btn btn-drive">📁 Drive</a>` : ''}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;

    if (options.teachers && teachers.length > 0) {
      contentHtml += `
        <section class="export-section">
          <h2 class="section-title">👨‍🏫 Directorio de Docentes</h2>
          <div class="cards-grid">
            ${teachers.map(t => `
              <div class="card">
                <h3 class="card-title">${escapeHtml(t.name)}</h3>
                <p class="meta-item"><i class="icon">📖</i> ${escapeHtml(t.subject || '')}</p>
                ${t.institution ? `<p class="meta-item"><i class="icon">🏛️</i> ${escapeHtml(t.institution)}</p>` : ''}
                ${t.officeHours ? `<p class="meta-item"><i class="icon">🕒</i> Consultas: ${escapeHtml(t.officeHours)}</p>` : ''}
                ${options.links ? `
                  <div class="card-actions">
                    ${t.email ? `<a href="mailto:${escapeHtml(t.email)}" class="btn btn-primary">✉️ ${escapeHtml(t.email)}</a>` : ''}
                    ${t.meetUrl ? `<a href="${escapeHtml(t.meetUrl)}" target="_blank" rel="noopener" class="btn btn-meet">📹 Sala Meet</a>` : ''}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }
  }

  // Reminders section (if requested)
  if (options.reminders && (data.reminders || []).length > 0) {
    const rems = data.reminders;
    contentHtml += `
      <section class="export-section">
        <h2 class="section-title">📌 Recordatorios y Entregas Pendientes (${rems.length})</h2>
        <div class="reminders-list">
          ${rems.map(r => `
            <div class="reminder-item priority-${r.priority || 'medium'}">
              <div class="reminder-main">
                <span class="reminder-title">${escapeHtml(r.title)}</span>
                ${r.details ? `<span class="reminder-desc">${escapeHtml(r.details)}</span>` : ''}
              </div>
              <div class="reminder-meta">
                ${r.dueDate ? `<span class="reminder-due">📅 ${escapeHtml(r.dueDate)} ${escapeHtml(r.dueTime || '')}</span>` : ''}
                <span class="priority-badge">${escapeHtml(r.priority || 'normal')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(userName)}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --bg-card: #131b2e;
      --bg-card-hover: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --border: rgba(255, 255, 255, 0.08);
      --green: #16a34a;
      --cyan: #0284c7;
      --emerald: #10b981;
      --amber: #f59e0b;
      --radius: 10px;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --bg-card: #ffffff;
        --bg-card-hover: #f1f5f9;
        --text: #0f172a;
        --text-muted: #64748b;
        --border: rgba(0, 0, 0, 0.08);
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    header.page-header {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    }
    .header-title h1 {
      font-size: 1.6rem;
      color: var(--text);
      margin-bottom: 4px;
    }
    .header-title p {
      color: var(--text-muted);
      font-size: 0.9rem;
    }
    .header-badge {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: var(--accent);
      padding: 6px 14px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 0.82rem;
    }
    .export-section {
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 1.18rem;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      border-bottom: 2px solid var(--border);
      padding-bottom: 6px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.15);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .badge {
      font-size: 0.72rem;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-career {
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent);
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    .badge-platform {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .card-title {
      font-size: 1.05rem;
      color: var(--text);
      font-weight: 700;
      line-height: 1.3;
    }
    .meta-item {
      font-size: 0.82rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .notes-box {
      font-size: 0.78rem;
      background: rgba(0,0,0,0.2);
      padding: 6px 10px;
      border-radius: 6px;
      color: var(--text-muted);
      font-style: italic;
    }
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: auto;
      padding-top: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 700;
      text-decoration: none;
      color: #ffffff;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
    .btn-primary { background: var(--accent); flex: 1 1 auto; }
    .btn-secondary { background: #334155; }
    .btn-classroom { background: var(--green); }
    .btn-meet { background: var(--cyan); }
    .btn-drive { background: var(--emerald); }
    
    /* Weekly grid */
    .weekly-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .weekly-day-column {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .day-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .day-header h3 { font-size: 0.95rem; }
    .day-count-badge { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
    .day-classes-list { display: flex; flex-direction: column; gap: 8px; }
    .weekly-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .weekly-card-title { font-size: 0.86rem; font-weight: 700; }
    .weekly-card-time { font-size: 0.76rem; color: var(--accent); font-weight: 600; }
    .weekly-card-meta { font-size: 0.74rem; color: var(--text-muted); }
    .weekly-links-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .mini-link {
      font-size: 0.68rem;
      padding: 2px 6px;
      border-radius: 4px;
      text-decoration: none;
      font-weight: 700;
      color: #fff;
    }
    .mini-link-campus { background: var(--accent); }
    .mini-link-classroom { background: var(--green); }
    .mini-link-meet { background: var(--cyan); }
    .mini-link-drive { background: var(--emerald); }
    .weekly-empty-day { font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 12px 0; text-align: center; }
    
    /* Quick links */
    .quick-links-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
    }
    .quick-link-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px 14px;
      text-decoration: none;
      color: var(--text);
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .quick-link-item:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Reminders */
    .reminders-list { display: flex; flex-direction: column; gap: 8px; }
    .reminder-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .reminder-item.priority-high { border-left: 4px solid #ef4444; }
    .reminder-item.priority-medium { border-left: 4px solid #f59e0b; }
    .reminder-item.priority-low { border-left: 4px solid #10b981; }
    .reminder-main { display: flex; flex-direction: column; gap: 2px; }
    .reminder-title { font-weight: 700; font-size: 0.88rem; }
    .reminder-desc { font-size: 0.78rem; color: var(--text-muted); }
    .reminder-meta { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; }
    .priority-badge {
      text-transform: uppercase;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255,255,255,0.06);
    }
    .empty-box {
      background: var(--bg-card);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
      color: var(--text-muted);
    }
    footer.page-footer {
      margin-top: 36px;
      border-top: 1px solid var(--border);
      padding-top: 16px;
      text-align: center;
      font-size: 0.78rem;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="page-header">
      <div class="header-title">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="header-badge">👤 ${escapeHtml(userName)} &bull; ${escapeHtml(dateFormatted)}</div>
    </header>

    <main>
      ${contentHtml}
    </main>

    <footer class="page-footer">
      <p>Generado con Mi Campus Personal &bull; Exportación Estática Web Autocontenida</p>
    </footer>
  </div>
</body>
</html>`;
}

function generateEmailHtml(data, options) {
  const { title, subtitle, dateFormatted, userName, scope } = data;

  let bodyHtml = '';

  if (scope === 'daily') {
    const classrooms = data.classrooms || [];
    bodyHtml += `
      <h2 style="font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 16px; margin-bottom: 12px;">
        📚 Clases de ${escapeHtml(data.dayName)} (${classrooms.length})
      </h2>
      ${classrooms.length > 0 ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px;">
          ${classrooms.map(c => `
            <tr>
              <td style="padding: 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${c.color || '#4f46e5'}; border-radius: 6px; margin-bottom: 8px;">
                <div style="font-size: 15px; font-weight: bold; color: #0f172a; margin-bottom: 4px;">${escapeHtml(c.name)}</div>
                ${c.schedule ? `<div style="font-size: 13px; color: #4338ca; font-weight: 600; margin-bottom: 4px;">🕒 Horario: ${escapeHtml(c.schedule)}</div>` : ''}
                ${c.institution ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 2px;">🏛️ Institución: ${escapeHtml(c.institution)}</div>` : ''}
                ${options.teachers && c.teacher ? `<div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">👨‍🏫 Docente: ${escapeHtml(c.teacher)}</div>` : ''}
                ${options.notes && c.notes ? `<div style="font-size: 12px; color: #475569; font-style: italic; background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; margin-bottom: 6px;">🔑 ${escapeHtml(c.notes)}</div>` : ''}
                ${options.links ? `
                  <div style="margin-top: 8px; font-size: 13px;">
                    <a href="${escapeHtml(c.url)}" target="_blank" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">🔗 Aula Virtual</a>
                    ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📚 Google Classroom</a>` : ''}
                    ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📹 Meet / Zoom</a>` : ''}
                    ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 5px 10px; border-radius: 4px; font-weight: bold; margin-right: 6px; margin-bottom: 4px;">📁 Drive</a>` : ''}
                  </div>
                ` : ''}
              </td>
            </tr>
            <tr><td height="8" style="font-size:0; line-height:0;">&nbsp;</td></tr>
          `).join('')}
        </table>
      ` : `<p style="color: #64748b; font-style: italic;">🎉 No hay clases programadas para este día.</p>`}
    `;
  } else if (scope === 'weekly') {
    const weeklySchedule = data.weeklySchedule || [];
    bodyHtml += `
      <h2 style="font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 16px; margin-bottom: 12px;">
        🗓️ Cronograma Semanal
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px;">
        ${weeklySchedule.map(day => `
          <tr>
            <td style="padding: 10px 12px; background-color: #f1f5f9; font-size: 14px; font-weight: bold; color: #1e293b; border: 1px solid #cbd5e1;">
              📅 ${escapeHtml(day.dayName)} (${day.classrooms.length} ${day.classrooms.length === 1 ? 'materia' : 'materias'})
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; background-color: #ffffff; border: 1px solid #e2e8f0; border-top: none;">
              ${day.classrooms.length > 0 ? `
                <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 13px;">
                  ${day.classrooms.map(c => `
                    <tr>
                      <td width="30%" style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${escapeHtml(c.name)}</td>
                      <td width="30%" style="color: #4338ca; font-weight: 600; border-bottom: 1px solid #f1f5f9;">🕒 ${escapeHtml(c.schedule || '')}</td>
                      <td width="40%" style="border-bottom: 1px solid #f1f5f9;">
                        ${options.links ? `
                          <a href="${escapeHtml(c.url)}" target="_blank" style="color: #4f46e5; text-decoration: none; font-weight: bold; margin-right: 6px;">[Aula]</a>
                          ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" style="color: #16a34a; text-decoration: none; font-weight: bold; margin-right: 6px;">[Classroom]</a>` : ''}
                          ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" style="color: #0284c7; text-decoration: none; font-weight: bold; margin-right: 6px;">[Meet]</a>` : ''}
                        ` : ''}
                      </td>
                    </tr>
                  `).join('')}
                </table>
              ` : `<span style="color: #94a3b8; font-size: 12px; font-style: italic;">Sin clases</span>`}
            </td>
          </tr>
          <tr><td height="8" style="font-size:0; line-height:0;">&nbsp;</td></tr>
        `).join('')}
      </table>
    `;
  } else {
    // Panorama General
    const classrooms = data.classrooms || [];
    bodyHtml += `
      <h2 style="font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 16px; margin-bottom: 12px;">
        📚 Listado de Materias (${classrooms.length})
      </h2>
      <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px; font-size: 13px;">
        <tr style="background-color: #f1f5f9; color: #475569; font-weight: bold; text-align: left;">
          <th style="border: 1px solid #cbd5e1; padding: 8px;">Materia</th>
          <th style="border: 1px solid #cbd5e1; padding: 8px;">Horario</th>
          ${options.teachers ? `<th style="border: 1px solid #cbd5e1; padding: 8px;">Docente</th>` : ''}
          ${options.links ? `<th style="border: 1px solid #cbd5e1; padding: 8px;">Enlaces</th>` : ''}
        </tr>
        ${classrooms.map(c => `
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px; font-weight: bold; color: #0f172a;">${escapeHtml(c.name)}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px; color: #4338ca; font-weight: 600;">${escapeHtml(c.schedule || '-')}</td>
            ${options.teachers ? `<td style="border: 1px solid #e2e8f0; padding: 8px; color: #475569;">${escapeHtml(c.teacher || '-')}</td>` : ''}
            ${options.links ? `
              <td style="border: 1px solid #e2e8f0; padding: 8px;">
                <a href="${escapeHtml(c.url)}" target="_blank" style="color: #4f46e5; font-weight: bold; text-decoration: none; margin-right: 6px;">[Aula]</a>
                ${c.googleUrl ? `<a href="${escapeHtml(c.googleUrl)}" target="_blank" style="color: #16a34a; font-weight: bold; text-decoration: none; margin-right: 6px;">[Classroom]</a>` : ''}
                ${c.meetingUrl ? `<a href="${escapeHtml(c.meetingUrl)}" target="_blank" style="color: #0284c7; font-weight: bold; text-decoration: none; margin-right: 6px;">[Meet]</a>` : ''}
                ${c.driveUrl ? `<a href="${escapeHtml(c.driveUrl)}" target="_blank" style="color: #059669; font-weight: bold; text-decoration: none; margin-right: 6px;">[Drive]</a>` : ''}
              </td>
            ` : ''}
          </tr>
        `).join('')}
      </table>
    `;
  }

  // Reminders for email
  if (options.reminders && (data.reminders || []).length > 0) {
    const rems = data.reminders;
    bodyHtml += `
      <h2 style="font-size: 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 16px; margin-bottom: 12px;">
        📌 Recordatorios Pendientes (${rems.length})
      </h2>
      <ul style="padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
        ${rems.map(r => `
          <li>
            <strong>${escapeHtml(r.title)}</strong>
            ${r.dueDate ? `<span style="color: #b45309; font-weight: bold;"> (📅 ${escapeHtml(r.dueDate)})</span>` : ''}
            ${r.details ? ` - <span style="color: #64748b;">${escapeHtml(r.details)}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    `;
  }

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 680px; margin: 0 auto; background-color: #ffffff; color: #1e293b; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="background-color: #4f46e5; color: #ffffff; padding: 16px; border-radius: 6px; margin-bottom: 18px;">
        <h1 style="font-size: 18px; margin: 0; padding: 0;">${escapeHtml(title)}</h1>
        <p style="font-size: 12px; margin: 4px 0 0 0; opacity: 0.9;">👤 ${escapeHtml(userName)} &bull; ${escapeHtml(dateFormatted)}</p>
      </div>
      ${bodyHtml}
      <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
        Generado desde Mi Campus Personal
      </div>
    </div>
  `;
}

function generatePlainText(data, options) {
  const { title, dateFormatted, userName, scope } = data;
  let text = `🎓 *${title.toUpperCase()}*\n`;
  text += `👤 Estudiante: ${userName} | 📅 ${dateFormatted}\n`;
  text += `========================================\n\n`;

  if (scope === 'daily') {
    const classrooms = data.classrooms || [];
    text += `📚 *CLASES DE ${data.dayName.toUpperCase()}* (${classrooms.length})\n`;
    text += `----------------------------------------\n`;
    if (classrooms.length > 0) {
      classrooms.forEach(c => {
        text += `\n📖 *${c.name}*\n`;
        if (c.schedule) text += `   🕒 Horario: ${c.schedule}\n`;
        if (c.institution) text += `   🏛️ Institución: ${c.institution}\n`;
        if (options.teachers && c.teacher) text += `   👨‍🏫 Docente: ${c.teacher}\n`;
        if (options.notes && c.notes) text += `   🔑 Notas: ${c.notes}\n`;
        if (options.links) {
          text += `   🔗 Aula: ${c.url}\n`;
          if (c.googleUrl) text += `   📚 Classroom: ${c.googleUrl}\n`;
          if (c.meetingUrl) text += `   📹 Meet/Zoom: ${c.meetingUrl}\n`;
          if (c.driveUrl) text += `   📁 Drive: ${c.driveUrl}\n`;
        }
      });
    } else {
      text += `🎉 No tienes clases programadas para este día.\n`;
    }
  } else if (scope === 'weekly') {
    const weeklySchedule = data.weeklySchedule || [];
    text += `🗓️ *CRONOGRAMA SEMANAL DE CURSADA*\n`;
    text += `----------------------------------------\n`;
    weeklySchedule.forEach(day => {
      text += `\n📅 *${day.dayName.toUpperCase()}* (${day.classrooms.length} materias):\n`;
      if (day.classrooms.length > 0) {
        day.classrooms.forEach(c => {
          text += `  • *${c.name}* [${c.schedule || 'Sin horario'}]\n`;
          if (options.links) {
            text += `    🔗 Aula: ${c.url}\n`;
            if (c.googleUrl) text += `    📚 Classroom: ${c.googleUrl}\n`;
            if (c.meetingUrl) text += `    📹 Meet: ${c.meetingUrl}\n`;
          }
        });
      } else {
        text += `    (Sin clases programadas)\n`;
      }
    });
  } else {
    // Panorama General
    const classrooms = data.classrooms || [];
    text += `📚 *MATERIAS ACTIVAS* (${classrooms.length})\n`;
    text += `----------------------------------------\n`;
    classrooms.forEach(c => {
      text += `\n📖 *${c.name}*\n`;
      if (c.schedule) text += `   🕒 Cursada: ${c.schedule}\n`;
      if (c.institution) text += `   🏛️ Institución: ${c.institution}\n`;
      if (options.teachers && c.teacher) text += `   👨‍🏫 Docente: ${c.teacher}\n`;
      if (options.links) {
        text += `   🔗 Aula: ${c.url}\n`;
        if (c.googleUrl) text += `   📚 Classroom: ${c.googleUrl}\n`;
        if (c.meetingUrl) text += `   📹 Meet: ${c.meetingUrl}\n`;
        if (c.driveUrl) text += `   📁 Drive: ${c.driveUrl}\n`;
      }
    });
  }

  if (options.reminders && (data.reminders || []).length > 0) {
    text += `\n📌 *RECORDATORIOS Y ENTREGAS*\n`;
    text += `----------------------------------------\n`;
    data.reminders.forEach(r => {
      text += `  • ${r.title} ${r.dueDate ? `[📅 ${r.dueDate}]` : ''}\n`;
      if (r.details) text += `    📝 ${r.details}\n`;
    });
  }

  text += `\n========================================\n`;
  text += `Generado desde Mi Campus Personal 🚀`;
  return text;
}

async function copyEmailFormatted() {
  const dataset = getExportDataset();
  const emailHtml = generateEmailHtml(dataset, exportState.options);
  const plainText = generatePlainText(dataset, exportState.options);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([emailHtml], { type: 'text/html' });
      const blobText = new Blob([plainText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': blobHtml,
        'text/plain': blobText
      });
      await navigator.clipboard.write([item]);
      showToast('¡Copiado con formato enriquecido para correo (Gmail/Outlook)!', 'success');
      return;
    }
  } catch (err) {
    console.warn('ClipboardItem write error, fallbacking to execCommand:', err);
  }

  // Fallback: create hidden contenteditable container
  const hiddenDiv = document.createElement('div');
  hiddenDiv.contentEditable = 'true';
  hiddenDiv.innerHTML = emailHtml;
  hiddenDiv.style.position = 'fixed';
  hiddenDiv.style.left = '-9999px';
  document.body.appendChild(hiddenDiv);
  hiddenDiv.focus();
  const range = document.createRange();
  range.selectNodeContents(hiddenDiv);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    document.execCommand('copy');
    showToast('¡Copiado con formato enriquecido para correo!', 'success');
  } catch (e) {
    // Ultimate fallback: plain text
    navigator.clipboard.writeText(plainText).then(() => {
      showToast('Copiado en texto plano al portapapeles', 'info');
    });
  } finally {
    document.body.removeChild(hiddenDiv);
  }
}

function downloadStandaloneHtml() {
  const dataset = getExportDataset();
  const html = generateStandaloneHtml(dataset, exportState.options);
  const dateStr = new Date().toISOString().split('T')[0];
  let filename = `panorama_academico_${exportState.scope}_${dateStr}.html`;
  if (exportState.scope === 'daily') {
    filename = `panorama_diario_${dataset.dayKey}_${dateStr}.html`;
  } else if (exportState.scope === 'weekly') {
    filename = `panorama_semanal_${dateStr}.html`;
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`¡Archivo web estático descargado: ${filename}!`, 'success');
}

function previewStandaloneTab() {
  const dataset = getExportDataset();
  const html = generateStandaloneHtml(dataset, exportState.options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  showToast('Abriendo vista previa web estática en nueva pestaña...', 'info');
}

function initExportModalListeners() {
  // Open modal button in header & settings
  document.getElementById('exportModalOpenBtn')?.addEventListener('click', openExportModal);
  document.getElementById('openExportFromSettingsBtn')?.addEventListener('click', () => {
    closeModal('settingsModal');
    openExportModal();
  });

  // Scope Cards
  document.querySelectorAll('.export-scope-card').forEach(card => {
    card.addEventListener('click', () => {
      exportState.scope = card.getAttribute('data-scope');
      updateExportUIFromState();
      updateExportPreview();
    });
  });

  // Day Pills
  document.querySelectorAll('.export-day-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      exportState.day = pill.getAttribute('data-day');
      updateExportUIFromState();
      updateExportPreview();
    });
  });

  // Options Toggles
  ['exportOptLinks', 'exportOptTeachers', 'exportOptReminders', 'exportOptNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        exportState.options.links = document.getElementById('exportOptLinks')?.checked ?? true;
        exportState.options.teachers = document.getElementById('exportOptTeachers')?.checked ?? true;
        exportState.options.reminders = document.getElementById('exportOptReminders')?.checked ?? true;
        exportState.options.notes = document.getElementById('exportOptNotes')?.checked ?? true;
        updateExportPreview();
      });
    }
  });

  // Tabs
  document.getElementById('exportTabHtml')?.addEventListener('click', () => {
    exportState.tab = 'html';
    updateExportUIFromState();
  });
  document.getElementById('exportTabText')?.addEventListener('click', () => {
    exportState.tab = 'text';
    updateExportUIFromState();
  });

  // Action Buttons
  document.getElementById('downloadStandaloneHtmlBtn')?.addEventListener('click', downloadStandaloneHtml);
  document.getElementById('previewStandaloneTabBtn')?.addEventListener('click', previewStandaloneTab);
  document.getElementById('copyEmailFormattedBtn')?.addEventListener('click', copyEmailFormatted);
  document.getElementById('copyPlainTextBtn')?.addEventListener('click', () => {
    const dataset = getExportDataset();
    const plainText = generatePlainText(dataset, exportState.options);
    navigator.clipboard.writeText(plainText).then(() => {
      showToast('¡Texto copiado para WhatsApp / Notas!', 'success');
    }).catch(() => {
      showToast('No se pudo copiar el texto', 'error');
    });
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-circle-info';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
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

// --- Inicialización de Event Listeners ---
function initEventListeners() {
  // Theme Toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  // Switch View Mode (Por Materia / Por Institución / Profesores / Biblioteca PDF)
  document.getElementById('viewModeSubjectsBtn')?.addEventListener('click', () => setViewMode('subjects'));
  document.getElementById('viewModeInstitutionsBtn')?.addEventListener('click', () => setViewMode('institutions'));
  document.getElementById('viewModeTeachersBtn')?.addEventListener('click', () => setViewMode('teachers'));
  document.getElementById('viewModePdfsBtn')?.addEventListener('click', () => setViewMode('pdfs'));

  // Global Search
  const searchInput = document.getElementById('globalSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  
  searchInput?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    if (clearSearchBtn) {
      clearSearchBtn.style.display = currentSearchQuery ? 'flex' : 'none';
    }
    renderMainCardsSection();
    renderReminders();
  });

  clearSearchBtn?.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderMainCardsSection();
    renderReminders();
  });

  // Day Filter Select (Vista por Materia)
  document.getElementById('dayFilterSelect')?.addEventListener('change', (e) => {
    activeDayFilter = e.target.value;
    renderDayFilters();
    renderClassrooms();
  });

  // Inicializar Chips interactivos de días en el modal
  initModalDayChips();

  // Filter Select (Career, Institution, Teacher or PDF Subject)
  document.getElementById('careerFilterSelect')?.addEventListener('change', (e) => {
    activeCareerFilter = e.target.value;
    if (appData.activeViewMode === 'subjects') {
      renderCareerFilters();
      renderClassrooms();
    } else if (appData.activeViewMode === 'institutions') {
      renderInstitutionFilters();
      renderInstitutions();
    } else if (appData.activeViewMode === 'teachers') {
      renderTeacherFilters();
      renderTeachers();
    } else if (appData.activeViewMode === 'pdfs') {
      renderPdfFilters();
      renderPdfs();
    }
  });

  // PDF Status Filter
  document.getElementById('pdfStatusFilterSelect')?.addEventListener('change', (e) => {
    activePdfStatusFilter = e.target.value;
    renderPdfs();
  });

  // Action Add Button (Materia, Institución, Profesor, o Subir PDF based on active view)
  const addBtn = document.getElementById('addClassroomBtn');
  const emptyAddBtn = document.getElementById('emptyAddClassroomBtn');
  
  function handleAddAction() {
    if (appData.activeViewMode === 'subjects') {
      openClassroomModal();
    } else if (appData.activeViewMode === 'institutions') {
      openInstitutionModal();
    } else if (appData.activeViewMode === 'teachers') {
      openTeacherModal();
    } else if (appData.activeViewMode === 'pdfs') {
      openPdfModal();
    }
  }

  addBtn?.addEventListener('click', handleAddAction);
  emptyAddBtn?.addEventListener('click', handleAddAction);

  // Classroom Modal Form
  document.getElementById('classroomForm')?.addEventListener('submit', handleClassroomFormSubmit);

  // Institution Modal Form
  document.getElementById('institutionForm')?.addEventListener('submit', handleInstitutionFormSubmit);

  // Teacher Modal Form
  document.getElementById('teacherForm')?.addEventListener('submit', handleTeacherFormSubmit);

  // PDF Modal Form
  document.getElementById('pdfForm')?.addEventListener('submit', handlePdfFormSubmit);

  // PDF File Selection & Drag-and-Drop Handling
  function processSelectedPdfFile(file, isDirect = false) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Por favor selecciona un archivo en formato PDF (.pdf)', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('El archivo supera el tamaño máximo de 50 MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target.result;
      const baseName = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

      if (isDirect) {
        openPdfModal();
      }

      document.getElementById('pdfFileBase64').value = base64Data;
      document.getElementById('pdfFileName').value = file.name;
      document.getElementById('pdfFileSize').value = file.size;

      const titleInput = document.getElementById('pdfTitle');
      if (titleInput && (!titleInput.value || titleInput.value.trim() === '')) {
        titleInput.value = baseName;
      }

      const labelFile = document.getElementById('pdfSelectedFileLabel');
      const hintFile = document.getElementById('pdfSelectedFileSizeHint');
      if (labelFile) labelFile.textContent = `Archivo seleccionado: ${file.name}`;
      if (hintFile) hintFile.textContent = `Tamaño: ${formatFileSize(file.size)}`;

      showToast(`Archivo "${file.name}" cargado`, 'success');
    };
    reader.readAsDataURL(file);
  }

  // File picker buttons
  const modalFileInput = document.getElementById('pdfFileInputModal');
  const selectPdfFileBtn = document.getElementById('selectPdfFileBtn');
  const modalDropzone = document.getElementById('pdfModalDropzone');

  selectPdfFileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    modalFileInput?.click();
  });

  modalDropzone?.addEventListener('click', () => {
    modalFileInput?.click();
  });

  modalFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedPdfFile(e.target.files[0], false);
    }
  });

  // Direct dropzone in page
  const directFileInput = document.getElementById('pdfFileInputDirect');
  const triggerPdfSelectBtn = document.getElementById('triggerPdfSelectBtn');
  const mainPdfDropzone = document.getElementById('pdfDropzone');

  triggerPdfSelectBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    directFileInput?.click();
  });

  mainPdfDropzone?.addEventListener('click', () => {
    directFileInput?.click();
  });

  directFileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedPdfFile(e.target.files[0], true);
    }
  });

  // Drag & Drop events on Dropzones
  [mainPdfDropzone, modalDropzone].forEach(dropzone => {
    if (!dropzone) return;

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        const isDirect = dropzone === mainPdfDropzone;
        processSelectedPdfFile(e.dataTransfer.files[0], isDirect);
      }
    });
  });

  // PDF Reader Controls
  document.getElementById('readerBackBtn')?.addEventListener('click', closePdfReader);
  document.getElementById('readerToggleNotesBtn')?.addEventListener('click', toggleReaderNotes);
  document.getElementById('readerFullscreenBtn')?.addEventListener('click', toggleReaderFullscreen);
  document.getElementById('copyReaderNotesToGlobalBtn')?.addEventListener('click', copyReaderNotesToGlobal);

  document.getElementById('readerFavoriteBtn')?.addEventListener('click', () => {
    if (currentReadingDocId) {
      togglePdfFavorite(currentReadingDocId);
      const doc = (appData.documents || []).find(d => d.id === currentReadingDocId);
      const favoriteBtn = document.getElementById('readerFavoriteBtn');
      if (favoriteBtn && doc) {
        favoriteBtn.className = `reader-action-btn ${doc.isFavorite ? 'is-favorite' : ''}`;
        favoriteBtn.innerHTML = `<i class="${doc.isFavorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>`;
      }
    }
  });

  document.getElementById('readerStatusSelect')?.addEventListener('change', (e) => {
    if (currentReadingDocId) {
      changePdfStatus(currentReadingDocId, e.target.value);
    }
  });

  // Debounced auto-save for Reader Notes
  const readerNotesTextarea = document.getElementById('readerNotesTextarea');
  const readerNotesIndicator = document.getElementById('readerNotesSaveIndicator');

  readerNotesTextarea?.addEventListener('input', (e) => {
    if (readerNotesIndicator) {
      readerNotesIndicator.textContent = 'Guardando...';
      readerNotesIndicator.classList.add('saving');
    }
    clearTimeout(readerNotesDebounceTimer);
    readerNotesDebounceTimer = setTimeout(() => {
      if (currentReadingDocId) {
        const doc = (appData.documents || []).find(d => d.id === currentReadingDocId);
        if (doc) {
          doc.notes = e.target.value;
          saveData();
        }
      }
      if (readerNotesIndicator) {
        readerNotesIndicator.textContent = 'Guardado';
        readerNotesIndicator.classList.remove('saving');
      }
    }, 600);
  });

  // Color preset clicks for classroom
  document.querySelectorAll('#colorPresets .color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      const input = document.getElementById('classroomColor');
      if (input) input.value = color;
    });
  });

  // Color preset clicks for institution
  document.querySelectorAll('#instColorPresets .color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      const input = document.getElementById('institutionColor');
      if (input) input.value = color;
    });
  });

  // Color preset clicks for teacher
  document.querySelectorAll('#teacherColorPresets .color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      const input = document.getElementById('teacherColor');
      if (input) input.value = color;
    });
  });

  // Reminders Filter Tabs
  document.querySelectorAll('.tab-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeReminderFilter = pill.getAttribute('data-filter');
      renderReminders();
    });
  });

  // Open Reminder Modal Button
  document.getElementById('addReminderBtn')?.addEventListener('click', () => openReminderModal());
  document.getElementById('reminderForm')?.addEventListener('submit', handleReminderFormSubmit);

  // Quick Links Management
  document.getElementById('manageQuickLinksBtn')?.addEventListener('click', openQuickLinksModal);
  document.getElementById('quickLinkForm')?.addEventListener('submit', handleQuickLinkFormSubmit);

  // Settings & Backup & Multi-Browser Sync
  document.getElementById('syncStatusBtn')?.addEventListener('click', openSettingsModal);
  document.getElementById('retrySyncBtn')?.addEventListener('click', () => checkServerAndSync(true));
  document.getElementById('copySyncUrlBtn')?.addEventListener('click', () => {
    const url = document.getElementById('syncUrlDisplay')?.textContent || 'http://localhost:3000';
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL copiada al portapapeles: ' + url, 'success');
    }).catch(() => {
      showToast('URL: ' + url, 'info');
    });
  });

  document.getElementById('settingsModalOpenBtn')?.addEventListener('click', openSettingsModal);
  document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.getElementById('openExportFromSettingsBtn')?.addEventListener('click', () => {
    closeModal('settingsModal');
    openExportModal();
  });
  document.getElementById('exportDataBtn')?.addEventListener('click', exportData);
  document.getElementById('importDataInput')?.addEventListener('change', importData);
  document.getElementById('loadSampleDataBtn')?.addEventListener('click', loadSampleData);
  document.getElementById('resetAllDataBtn')?.addEventListener('click', resetAllData);

  // --- Notificaciones Diarias Event Listeners ---
  document.getElementById('notifEnabledToggle')?.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    notificationConfig.enabled = isEnabled;
    const configFields = document.getElementById('notifConfigFields');
    const statusBadge = document.getElementById('notifStatusBadge');
    if (configFields) configFields.style.display = isEnabled ? 'flex' : 'none';
    if (statusBadge) {
      statusBadge.textContent = isEnabled ? 'Activo' : 'Inactivo';
      statusBadge.className = isEnabled ? 'badge badge-success' : 'badge';
    }
  });

  document.querySelectorAll('.notif-channel-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const channel = pill.getAttribute('data-channel');
      notificationConfig.channel = channel;
      const channelVal = document.getElementById('notifChannelVal');
      if (channelVal) channelVal.value = channel;

      document.querySelectorAll('.notif-channel-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const emailCard = document.getElementById('notifEmailCard');
      const telegramCard = document.getElementById('notifTelegramCard');
      if (emailCard) {
        emailCard.style.display = (channel === 'email' || channel === 'both') ? 'flex' : 'none';
      }
      if (telegramCard) {
        telegramCard.style.display = (channel === 'telegram' || channel === 'both') ? 'flex' : 'none';
      }
    });
  });

  document.getElementById('notifEmailService')?.addEventListener('change', (e) => {
    const service = e.target.value;
    const hostInput = document.getElementById('notifEmailHost');
    const portInput = document.getElementById('notifEmailPort');
    const secureInput = document.getElementById('notifEmailSecure');
    const advancedDetails = document.getElementById('notifEmailAdvanced');

    if (service === 'gmail') {
      if (hostInput) hostInput.value = 'smtp.gmail.com';
      if (portInput) portInput.value = '465';
      if (secureInput) secureInput.checked = true;
    } else if (service === 'outlook') {
      if (hostInput) hostInput.value = 'smtp.office365.com';
      if (portInput) portInput.value = '587';
      if (secureInput) secureInput.checked = false;
    } else if (service === 'custom') {
      if (advancedDetails) advancedDetails.open = true;
    }
  });

  document.getElementById('toggleEmailPassBtn')?.addEventListener('click', () => {
    const passInput = document.getElementById('notifEmailPass');
    const toggleBtn = document.getElementById('toggleEmailPassBtn');
    if (!passInput || !toggleBtn) return;

    if (passInput.type === 'password') {
      passInput.type = 'text';
      toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
      passInput.type = 'password';
      toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
  });

  document.getElementById('testEmailBtn')?.addEventListener('click', () => testNotification('email'));
  document.getElementById('testTelegramBtn')?.addEventListener('click', () => testNotification('telegram'));
  document.getElementById('testBothBtn')?.addEventListener('click', () => {
    const ch = document.getElementById('notifChannelVal')?.value || 'both';
    testNotification(ch);
  });
  document.getElementById('sendNowBtn')?.addEventListener('click', sendDailySummaryNow);

  // Inicializar listeners del Centro de Exportación
  initExportModalListeners();

  // Close modals on backdrop click or close button
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      if (modalId === 'pdfReaderModal') {
        closePdfReader();
      } else {
        closeModal(modalId);
      }
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        if (modal.id === 'pdfReaderModal') {
          closePdfReader();
        } else {
          modal.style.display = 'none';
        }
      }
    });
  });

  // Debounced auto-save for Quick Notes
  let notesTimeout;
  const notesTextarea = document.getElementById('quickNotesTextarea');
  const notesIndicator = document.getElementById('notesSaveIndicator');
  
  notesTextarea?.addEventListener('input', (e) => {
    if (notesIndicator) {
      notesIndicator.textContent = 'Guardando...';
      notesIndicator.classList.add('saving');
    }
    clearTimeout(notesTimeout);
    notesTimeout = setTimeout(() => {
      appData.quickNotes = e.target.value;
      saveData();
      if (notesIndicator) {
        notesIndicator.textContent = 'Guardado';
        notesIndicator.classList.remove('saving');
      }
    }, 600);
  });
}

