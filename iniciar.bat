@echo off
title Mi Campus Personal - Servidor Multi-Navegador
chcp 65001 >nul
cls

echo ======================================================================
echo    🎓 MI CAMPUS PERSONAL - INICIANDO SINCRONIZACIÓN MULTI-NAVEGADOR
echo ======================================================================
echo.

:: Verificar si Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor instala Node.js desde https://nodejs.org/ para usar la sincronizacion.
    echo.
    echo Abriendo la aplicacion en modo local basico...
    start "" index.html
    pause
    exit /b
)

echo [OK] Node.js detectado correctamente.
echo [INFO] Iniciando servidor en http://localhost:3000 ...
echo.
echo ======================================================================
echo  💡 NOTA: Deja esta ventana abierta mientras uses tus navegadores.
echo     Todos tus cambios en Chrome, Edge, Firefox o Brave se guardaran
echo     en tiempo real en el mismo archivo central.
echo ======================================================================
echo.

:: Abrir el navegador en la URL del servidor
timeout /t 1 /nobreak >nul
start http://localhost:3000

:: Ejecutar el servidor
node server.js
