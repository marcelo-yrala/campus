# 🎓 Mi Campus Personal - Homepage Académica

Un sistema moderno, intuitivo y estético para utilizar como **página de inicio (Homepage)** en tus navegadores. Te permite organizar accesos directos a todas las aulas virtuales de tus carreras o cursos, gestionar recordatorios y fechas de exámenes/entregas, bloc de notas rápido, enlaces institucionales y **sincronización en tiempo real entre múltiples navegadores (Chrome, Edge, Firefox, Brave, etc.)**.

---

## 🚀 Sincronización Multi-Navegador (Misma información en todos lados)

Para que todos tus navegadores compartan **siempre exactamente la misma información en tiempo real**:

### Opción 1: En 1 Clic con `iniciar.bat` (Recomendado en Windows)
1. Haz doble clic en el archivo **`iniciar.bat`** dentro de esta carpeta.
2. Se iniciará el servidor de sincronización y se abrirá automáticamente en tu navegador:
   👉 **`http://localhost:3000`**
3. Cualquier cambio que hagas en Chrome, Edge, Firefox o Brave se guardará inmediatamente en el archivo centralizado `data/campus_data.json` y se actualizará en vivo en todas las pestañas abiertas.

### Opción 2: Desde la Terminal con `npm`
```bash
npm start
```
Luego abre `http://localhost:3000` en los navegadores que quieras.

---

## ✨ Características Principales

- 🔄 **Sincronización en Tiempo Real Multi-Navegador**:
  - Servidor local ultraligero integrado en Node.js (cero dependencias externas requeridas).
  - Persistencia compartida en `data/campus_data.json` con copias de seguridad automáticas.
  - Actualización instantánea entre navegadores vía *Server-Sent Events (SSE)* sin recargar la página.
  - Indicador de estado visual (🟢 Conectado / 🟡 Modo Local).

- 🏛️ **Tarjetas de Aulas Virtuales**:
  - Organizadas por carrera / especialidad o por Institución (Switch de vista dinámico).
  - Compatibilidad con múltiples plataformas: *Moodle, Google Classroom, Microsoft Teams, Canvas LMS, Blackboard, Zoom/Meet y Enlaces Web personalizados*.
  - Color e icono temático por materia.
  - Visualización de horarios de cursada, profesor/comisión y contraseñas/notas de matriculación.
  - Botón directo de **"Abrir Aula"** y botón para copiar el enlace al portapapeles.

- 📅 **Gestor de Recordatorios & Entregas**:
  - Filtros por: *Pendientes*, *Hoy / Próximos 3 días*, *Completados* y *Todos*.
  - Prioridades visuales: Alta / Urgente (Rojo), Media (Amarillo) y Baja (Verde).
  - Cálculo automático de días restantes o aviso de entrega vencida.
  - Asociación directa con la materia o aula virtual correspondiente.

- ⚡ **Barra de Enlaces Rápidos**:
  - Acceso directo a Correo Institucional, Google Drive, Biblioteca Digital, Portal de Alumnos (SIU Guaraní), etc.
  - Capacidad para agregar, modificar o eliminar enlaces desde la misma pantalla.

- 📝 **Bloc de Notas Rápido**:
  - Guardado automático con auto-sync en tiempo real para apuntes breves, enlaces temporales o notas del día.

- 🔍 **Buscador Global y Filtros**:
  - Búsqueda instantánea de cualquier materia, profesor o recordatorio.
  - Píldoras de filtrado dinámico por cada carrera o institución creada.

- 🎨 **Diseño Moderno & Temas**:
  - Efecto *Glassmorphism* con acentos de color vibrantes.
  - Selector de **Modo Oscuro (Midnight)** y **Modo Claro (Clean Light)**.
  - Reloj en vivo y saludo personalizado según el momento del día.

- 🔔 **Resumen Matutino Automático (Correo y Telegram)**:
  - Envío matutino programado (ej: 07:00 hs) con tus materias del día, horarios, links directos (Aula, Google Classroom, Meet/Zoom, Drive) y recordatorios pendientes.
  - Elige libremente tu canal: **Solo Correo (SMTP/Gmail/Outlook)**, **Solo Telegram Bot**, o **Ambos canales**.
  - Script asistente para Windows: **`programar_resumen_windows.bat`** para registrar la tarea en el Programador de Tareas de Windows (Task Scheduler) y activarse al encender la PC por la mañana.
  - Botones de prueba en vivo desde los Ajustes (`🧪 Probar Correo`, `🧪 Probar Telegram`, `🚀 Enviar Resumen de Hoy Ahora`).

- 📤 **Centro de Exportación & Compartir**:
  - Exportación de **Panorama General**, **Panorama Diario** y **Panorama Semanal**.
  - Generación de página web estática HTML para subir a cualquier hosting tradicional.
  - Copia en formato enriquecido para correos electrónicos y formato texto para WhatsApp.

- 💾 **Privacidad y Copias de Seguridad (Backup)**:
  - Exportación e importación en formato `.json` para respaldar o sincronizar entre diferentes computadoras.

---

## 🌐 Cómo Configurar como Página de Inicio (Homepage) en tus Navegadores

Configura la dirección **`http://localhost:3000`** como página de inicio para tener siempre tus materias y notas sincronizadas:

### En Google Chrome / Brave:
1. Abre Configuración (`chrome://settings`).
2. En el menú lateral, selecciona **Al iniciar** (o *On startup*).
3. Selecciona **Abrir una página específica o un conjunto de páginas**.
4. Haz clic en **Añadir una nueva página** y pega:
   `http://localhost:3000`

### En Microsoft Edge:
1. Abre Configuración (`edge://settings`).
2. Ve a **Inicio, inicio y pestañas nuevas**.
3. En la sección "Al iniciar Microsoft Edge", elige **Abrir estas páginas** y añade:
   `http://localhost:3000`

### En Mozilla Firefox:
1. Abre Ajustes (`about:preferences#home`).
2. En **Página de inicio y ventanas nuevas**, selecciona *URLs personalizadas...* y escribe:
   `http://localhost:3000`

---

## 🔐 Seguridad, Login y Despliegue en Internet (Alwaysdata / Cloud)

El proyecto incluye un sistema de **autenticación y login seguro** nativo de Node.js (cero dependencias externas) pensado para cuando publicas tu campus en un servidor o hosting como **Alwaysdata**:

### ☁️ Despliegue en Alwaysdata (Plan Gratuito 100 MB)
1. Regístrate en [alwaysdata.com](https://www.alwaysdata.com).
2. Sube todos los archivos del proyecto a tu cuenta (vía Administrador de Archivos Web, SFTP o Git).
3. En el panel de Alwaysdata, ve a **Web** > **Sites** > **Add a site**:
   - **Type:** Node.js
   - **Node.js version:** Node 18, 20 o 22 (LTS).
   - **Application path:** Ruta a la carpeta del proyecto.
   - **Command:** `node server.js`
4. ¡Listo! Tu campus estará disponible en tu subdominio (ej: `https://tu-usuario.alwaysdata.net`) con SSL (HTTPS) automático y persistencia en disco.

### 🛡️ Características de Seguridad
- **Cifrado Fuerte:** Las contraseñas se derivan criptográficamente con algoritmo `Scrypt` y una sal (*salt*) aleatoria única de 16 bytes.
- **Protección de APIs y PDFs:** Todas las rutas `/api/data`, `/api/notifications/*` y los documentos PDF de `/api/pdfs/*` requieren una sesión válida.
- **Protección Anti Fuerza Bruta:** Bloqueo temporal de 5 minutos si se registran 5 intentos fallidos consecutivos desde una misma IP.
- **Sesión Persistente:** Opción *"Recordar sesión"* válida por 30 días mediante cookies seguras `HttpOnly` y `SameSite=Lax`.
- **Gestión desde Ajustes:** Puedes cambiar tu contraseña o activar/desactivar el requerimiento de contraseña desde el menú de Ajustes (`⚙️`).

### 🔑 Recuperación de Contraseña
Si en algún momento olvidas tu contraseña maestra:
1. Abre la carpeta `data/` en tu servidor o PC.
2. Elimina el archivo `data/auth_config.json`.
3. Al recargar la página, el sistema te solicitará configurar una nueva contraseña maestra de inmediato.

