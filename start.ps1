# Script para iniciar el entorno local con Docker, N8N y Tunnelmole

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     N8N Local Setup con Tunnelmole                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Paso 1: Inicia Docker Compose
Write-Host "`n[1/4] Iniciando Docker Compose..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker Compose iniciado correctamente" -ForegroundColor Green
} else {
    Write-Host "✗ Error al iniciar Docker Compose" -ForegroundColor Red
    exit 1
}

# Paso 2: Espera a que N8N esté listo
Write-Host "`n[2/4] Esperando a que N8N esté disponible..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$n8nReady = $false

while ($attempt -lt $maxAttempts) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ N8N está disponible en http://localhost:5678" -ForegroundColor Green
            $n8nReady = $true
            break
        }
    } catch {
        $attempt++
        if ($attempt -lt $maxAttempts) {
            Write-Host "  Intento $attempt/$maxAttempts - esperando..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $n8nReady) {
    Write-Host "✗ N8N no está disponible después de esperar" -ForegroundColor Red
    exit 1
}

# Paso 3: Obtener el webhook path
Write-Host "`n[3/4] Configuración del webhook..." -ForegroundColor Yellow
$webhookPath = Read-Host "Introduce el path del webhook de N8N (ejemplo: /webhook/3bffaaea-4f6d-4e80-bf54-ca08a3a7c72b)"

if (-not $webhookPath.StartsWith("/")) {
    $webhookPath = "/$webhookPath"
}

Write-Host "✓ Webhook path configurado: $webhookPath" -ForegroundColor Green

# Paso 4: Información de acceso local
Write-Host "`n[4/4] Servidor listo para usar" -ForegroundColor Yellow

Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ENTORNO LOCAL LISTO                       ║" -ForegroundColor Green
Write-Host "╠════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║                                                        ║" -ForegroundColor Green
Write-Host "║ 🌐 URLs de Acceso:                                    ║" -ForegroundColor Green
Write-Host "║   • N8N UI:       http://localhost:5678                ║" -ForegroundColor Green
Write-Host "║   • Proxy:        http://localhost:3000                ║" -ForegroundColor Green
Write-Host "║   • Formulario:   http://localhost:3000/form           ║" -ForegroundColor Green
Write-Host "║   • Config:       http://localhost:3000/api/config     ║" -ForegroundColor Green
Write-Host "║                                                        ║" -ForegroundColor Green
Write-Host "║ 📝 Webhook Path en N8N: $webhookPath" -ForegroundColor Green
Write-Host "║                                                        ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1️⃣  Abre otra terminal PowerShell" -ForegroundColor White
Write-Host "2️⃣  Ejecuta: tmole 3000" -ForegroundColor White
Write-Host "3️⃣  Obtendrás una URL pública: https://xxxx.tunnelmole.com" -ForegroundColor White
Write-Host "4️⃣  Usa esa URL para acceder: https://xxxx.tunnelmole.com/form" -ForegroundColor White
Write-Host "5️⃣  Prueba el formulario y verifica que llega a N8N" -ForegroundColor White

Write-Host "`n✅ Sistema listo. Presiona Ctrl+C para detener Docker Compose" -ForegroundColor Green

# Mantener Docker en ejecución
while ($true) {
    Start-Sleep -Seconds 60
}