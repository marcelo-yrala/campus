# 🎓 SelfCampus - Homepage Académica & Dashboard Personal

<p align="center">
  <b>Un sistema moderno, intuitivo y estético para utilizar como página de inicio (Homepage) en tus navegadores.</b><br>
  Organiza accesos directos a todas tus aulas virtuales, materias, recordatorios de exámenes/entregas, biblioteca PDF local, resumen matutino automático (Email y Telegram), sincronización multi-navegador en tiempo real y autenticación segura con cero dependencias externas.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18%2B-339933?style=flat&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Dependencies-0%20(Pure%20Native)-blue?style=flat" alt="Dependencies">
  <img src="https://img.shields.io/badge/RealTime-Server--Sent%20Events-orange?style=flat" alt="SSE Sync">
  <img src="https://img.shields.io/badge/Security-Scrypt%20Auth-success?style=flat" alt="Security">
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat" alt="License">
</p>

---

## ✨ Características Principales

- 🔄 **Sincronización en Tiempo Real Multi-Navegador**:
  - Servidor local/cloud ultraligero integrado en Node.js puro (**cero dependencias `npm` requeridas**).
  - Persistencia compartida en `data/campus_data.json` con copias de seguridad automáticas atómicas.
  - Actualización instantánea entre pestañas y navegadores vía *Server-Sent Events (SSE)* sin recargar.

- 🔐 **Sistema de Login y Seguridad Criptográfica**:
  - Pantalla de inicio de sesión con estética *Glassmorphism* (soporta Modo Oscuro y Modo Claro).
  - Algoritmo de derivación de claves criptográficas `Scrypt` con sal única por instalación.
  - Sesiones persistentes (30 días con cookies `HttpOnly`).
  - Protección contra ataques de fuerza bruta (bloqueo temporal tras 5 intentos fallidos).
  - Todas las APIs de datos, biblioteca PDF y notificaciones protegidas contra accesos no autorizados.

- 🏛️ **Gestión de Aulas Virtuales & Switch de Vistas**:
  - **Vista por Materia / Carrera**: Tarjetas dinámicas organizadas con horarios, profesores, plataforma (*Moodle, Classroom, Teams, Canvas, Zoom, etc.*) y notas de matriculación.
  - **Vista por Institución**: Portales generales y accesos a sistemas de autogestión de alumnos (SIU Guaraní, etc.).
  - **Directorio de Profesores**: Registro de docentes, correos, teléfonos y horarios de consulta.

- 📚 **Biblioteca PDF Local Integrada**:
  - Almacenamiento y visualización rápida de guías de estudio, libros, apuntes y programas de materias.
  - Visor integrado con soporte para streaming y navegación de páginas.
  - Clasificación por categorías, etiquetas, estado de lectura y favoritos.

- 📅 **Gestor de Recordatorios & Fechas de Entrega**:
  - Filtros por: *Pendientes*, *Hoy / Próximos 3 días*, *Completados* y *Todos*.
  - Prioridades visuales: Alta / Urgente (Rojo), Media (Amarillo) y Baja (Verde).
  - Cálculo automático de días restantes o alerta de vencimiento.

- ⚡ **Barra de Enlaces Rápidos & Bloc de Notas**:
  - Accesos directos personalizables a Correo Institucional, Drive, Biblioteca Digital, etc.
  - Bloc de notas rápido con auto-guardado en tiempo real para apuntes y notas del día.

- 🔔 **Resumen Matutino Automático (Email y Telegram)**:
  - Envío automático diario programado (ej: 07:00 hs) con tus clases del día, docentes, horarios, enlaces directos y entregas pendientes.
  - Canales configurables: **Solo Correo (SMTP/Gmail/Outlook)**, **Solo Telegram Bot** o **Ambos canales**.
  - Botones de prueba integrados en Ajustes.

- 📤 **Centro de Exportación & Compartir**:
  - Generación de página web estática `.html` autocontenida lista para subir a cualquier hosting.
  - Copia de resúmenes en formato enriquecido para correos electrónicos o texto con emojis para WhatsApp.

---

## 🚀 Inicio Rápido

### En Windows (1 Clic)
1. Descarga o clona este repositorio.
2. Haz doble clic en el archivo **`iniciar.bat`**.
3. Se iniciará el servidor y se abrirá automáticamente en tu navegador:
   👉 **`http://localhost:3000`**
4. En el primer inicio, define tu **Contraseña Maestra** para proteger tu campus.

### Desde la Terminal (Cualquier Sistema: Linux, macOS, Windows)
```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/selfcampus.git
cd selfcampus

# 2. Iniciar el servidor (¡No requiere npm install!)
node server.js
# o bien: npm start
```
Luego abre `http://localhost:3000` en tu navegador favorito.

---

## ☁️ Despliegue en la Nube (Alwaysdata / VPS / Docker)

Este proyecto está optimizado para funcionar en hostings gratuitos como **Alwaysdata** (Plan gratuito de 100 MB con persistencia en disco real y SSL gratis):

### Despliegue en Alwaysdata
1. Regístrate en [alwaysdata.com](https://www.alwaysdata.com).
2. Sube los archivos del proyecto a tu cuenta (vía Administrador de Archivos Web, SFTP o Git).
3. En el panel de Alwaysdata, ve a **Web** > **Sites** > **Add a site**:
   - **Type:** Node.js
   - **Node.js version:** Node 18, 20 o 22 (LTS).
   - **Application path:** Ruta a la carpeta del proyecto (ej: `selfcampus`).
   - **Command:** `node server.js`
4. *(Opcional para resumen matutino)* En **Environment variables**, agrega `TZ` con la zona horaria de tu país (ej: `America/Argentina/Buenos_Aires` o `America/Mexico_City`).
5. ¡Listo! Tu campus estará disponible en tu subdominio (ej: `https://tu-usuario.alwaysdata.net`) con certificado SSL automático.

---

## 🌐 Configurar como Página de Inicio (Homepage) en tus Navegadores

Configura la dirección de tu campus (`http://localhost:3000` o la URL de tu servidor en la nube) como página de inicio:

- **Google Chrome / Brave:** Configuración > *Al iniciar* > *Abrir una página específica* > Añadir la URL.
- **Microsoft Edge:** Configuración > *Inicio, inicio y pestañas nuevas* > *Al iniciar Microsoft Edge* > Añadir la URL.
- **Mozilla Firefox:** Ajustes > *Inicio* > *Página de inicio y ventanas nuevas* > *URLs personalizadas* > Pegar la URL.

---

## 🔑 Recuperación de Contraseña Maestra

Si olvidas tu contraseña maestra:
1. Abre la carpeta `data/` en tu servidor o computadora.
2. Elimina el archivo `data/auth_config.json`.
3. Al recargar la página, el sistema te solicitará configurar una nueva contraseña maestra de inmediato.

---

## 📁 Estructura del Proyecto

```text
selfcampus/
├── css/
│   └── styles.css              # Sistema de diseño, Glassmorphism y temas
├── js/
│   └── app.js                  # Lógica del cliente, sincronización y auth
├── data/
│   ├── campus_data.json        # Base de datos JSON de materias y tareas
│   ├── notifications_config.json # Configuración de SMTP y Telegram Bot
│   ├── auth_config.json        # Configuración de contraseñas y sesiones
│   └── pdfs/                   # Directorio de documentos y apuntes PDF
├── scripts/
│   └── send_daily_summary.js   # Script standalone para envío diario
├── index.html                  # Dashboard e interfaz visual principal
├── server.js                   # Servidor Node.js nativo (Auth, SSE, APIs)
├── iniciar.bat                 # Lanzador de 1 clic para Windows
├── programar_resumen_windows.bat # Programador de tareas matutinas en Windows
├── .gitignore
├── LICENSE
└── README.md
```

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
