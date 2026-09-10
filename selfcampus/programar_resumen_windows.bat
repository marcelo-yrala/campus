@echo off
chcp 65001 >nul
title Mi Campus Personal - Programador de Resumen Matutino

:MENU
cls
echo ======================================================================
echo   🎓 MI CAMPUS PERSONAL - PROGRAMADOR DE TAREAS DE WINDOWS
echo ======================================================================
echo.
echo   Este asistente configura Windows para que envíe de forma automática
echo   tu resumen matutino de materias por Correo o Telegram cada mañana,
echo   incluso si enciendes la PC a la mañana temprano.
echo.
echo   [1] Programar Envío Diario Matutino (Hora predeterminada: 07:00 hs)
echo   [2] Programar Envío Diario con Hora Personalizada
echo   [3] Probar Envío Manual AHORA (Ejecutar script en consola)
echo   [4] Ver Estado de la Tarea Programada en Windows
echo   [5] Eliminar Tarea Programada de Windows
echo   [6] Salir
echo.
echo ======================================================================
set /p OPTION="Selecciona una opción (1-6): "

if "%OPTION%"=="1" goto PROG_DEFAULT
if "%OPTION%"=="2" goto PROG_CUSTOM
if "%OPTION%"=="3" goto RUN_TEST
if "%OPTION%"=="4" goto VIEW_STATUS
if "%OPTION%"=="5" goto DELETE_TASK
if "%OPTION%"=="6" goto EXIT
goto MENU

:PROG_DEFAULT
set NOTIF_TIME=07:00
goto DO_SCHEDULE

:PROG_CUSTOM
echo.
echo Ingresa la hora deseada en formato 24hs (Ej: 06:30, 07:00, 08:15):
set /p NOTIF_TIME="Hora: "
if "%NOTIF_TIME%"=="" set NOTIF_TIME=07:00
goto DO_SCHEDULE

:DO_SCHEDULE
echo.
echo ======================================================================
echo Registrando tarea diaria en el Programador de Tareas de Windows...
echo Hora configurada: %NOTIF_TIME% hs
echo ======================================================================
echo.

set SCRIPT_PATH=%~dp0scripts\send_daily_summary.js

schtasks /Create /SC DAILY /TN "MiCampus_ResumenMatutino" /TR "node \"%SCRIPT_PATH%\"" /ST %NOTIF_TIME% /F

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ ¡TAREA PROGRAMADA CON ÉXITO!
    echo.
    echo Windows ejecutará el script todas las mañanas a las %NOTIF_TIME% hs.
    echo Recuerda haber configurado tus datos en la aplicación (Ajustes > Resumen Diario).
) else (
    echo.
    echo ⚠️ Hubo un error al registrar la tarea. Si pide permisos de Administrador,
    echo haz clic derecho en este archivo y selecciona "Ejecutar como Administrador".
)
echo.
pause
goto MENU

:RUN_TEST
cls
echo ======================================================================
echo Ejecutando envío manual de prueba con tus materias de hoy...
echo ======================================================================
echo.
node "%~dp0scripts\send_daily_summary.js"
echo.
echo ======================================================================
pause
goto MENU

:VIEW_STATUS
cls
echo ======================================================================
echo Estado de la tarea "MiCampus_ResumenMatutino" en Windows:
echo ======================================================================
echo.
schtasks /Query /TN "MiCampus_ResumenMatutino" /FO LIST /V
echo.
pause
goto MENU

:DELETE_TASK
cls
echo ======================================================================
echo Eliminando tarea programada "MiCampus_ResumenMatutino"...
echo ======================================================================
echo.
schtasks /Delete /TN "MiCampus_ResumenMatutino" /F
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Tarea eliminada correctamente de Windows.
) else (
    echo.
    echo No se encontró la tarea o ya fue eliminada.
)
echo.
pause
goto MENU

:EXIT
exit /b
