@echo off
REM Script para iniciar el entorno local con Docker, N8N y Tunnelmole
REM Compatible con CMD de Windows

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║     N8N Local Setup con Tunnelmole                     ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Paso 1: Iniciar Docker Compose
echo [1/3] Iniciando Docker Compose...
docker compose up -d
if errorlevel 1 (
    echo ✗ Error al iniciar Docker Compose
    exit /b 1
)
echo ✓ Docker Compose iniciado
echo.

REM Paso 2: Esperar a que N8N esté ready
echo [2/3] Esperando a que N8N esté disponible (máx 30 segundos)...
setlocal enabledelayedexpansion
set attempts=0
:check_n8n
set /a attempts+=1
if !attempts! gtr 30 (
    echo ✗ N8N no está disponible
    exit /b 1
)

REM Intenta curl a N8N
curl -s http://localhost:5678 >nul 2>&1
if errorlevel 1 (
    echo  Intento !attempts!/30 - esperando...
    timeout /t 1 /nobreak >nul
    goto check_n8n
)

echo ✓ N8N está disponible en http://localhost:5678
echo.

REM Paso 3: Obtener webhook path
echo [3/3] Configuración del Webhook
echo.
echo Introduce el path del webhook de N8N
echo Ejemplo: /webhook/3bffaaea-4f6d-4e80-bf54-ca08a3a7c72b
echo.
set /p webhookPath="Webhook path: "

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║         ENTORNO LOCAL LISTO                           ║
echo ╠════════════════════════════════════════════════════════╣
echo ║                                                        ║
echo ║ 🌐 URLs de Acceso:                                    ║
echo ║   • N8N UI:       http://localhost:5678                ║
echo ║   • Proxy:        http://localhost:3000                ║
echo ║   • Formulario:   http://localhost:3000/form           ║
echo ║   • Config:       http://localhost:3000/api/config     ║
echo ║                                                        ║
echo ║ 📝 Webhook Path: %webhookPath%
echo ║                                                        ║
echo ╚════════════════════════════════════════════════════════╝
echo.

echo 📋 Próximos pasos:
echo.
echo 1. Abre una nueva terminal (CMD o PowerShell)
echo 2. Ejecuta: tmole 3000
echo 3. Obtendrás una URL pública: https://xxxx.tunnelmole.com
echo 4. Accede a: https://xxxx.tunnelmole.com/form
echo 5. Prueba el formulario
echo.

echo ✅ Docker Compose está corriendo
echo ✅ Presiona Ctrl+C para detener
echo.

:loop
timeout /t 60 /nobreak >nul
goto loop

endlocal
