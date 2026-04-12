# ============================================================================
#  n8n Webhook Tunnel — Start Script
#  Arranca Docker (n8n), inicia tmole, y registra el túnel con Render
# ============================================================================

# --- Cargar configuración desde .env ---
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $val = $parts[1].Trim()
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
    Write-Host "[OK] Configuracion cargada desde .env" -ForegroundColor Green
}

# --- Variables ---
$RENDER_URL = $env:RENDER_URL
$CONFIG_TOKEN = $env:CONFIG_TOKEN
if (-not $CONFIG_TOKEN) { $CONFIG_TOKEN = "mysecret" }

if (-not $RENDER_URL) {
    Write-Host ""
    Write-Host "[ERROR] Falta RENDER_URL en .env" -ForegroundColor Red
    Write-Host "  Anade la URL de tu servicio en Render al archivo .env" -ForegroundColor Yellow
    Write-Host "  Ejemplo: RENDER_URL=https://n8n-proxy-b2m9.onrender.com" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  n8n Webhook Tunnel" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
#  Paso 1: Arrancar Docker Compose
# ============================================================================
Write-Host "[1/4] Arrancando Docker Compose..." -ForegroundColor Yellow

docker compose up -d 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] No se pudo arrancar Docker Compose" -ForegroundColor Red
    Write-Host "  Asegurate de tener Docker Desktop ejecutandose" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Docker Compose arrancado" -ForegroundColor Green
Write-Host ""

# ============================================================================
#  Paso 2: Esperar a que n8n esté listo
# ============================================================================
Write-Host "[2/4] Esperando a que n8n este disponible..." -ForegroundColor Yellow

$maxAttempts = 60
$ready = $false

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5678" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {
        # n8n aún no está disponible
    }
    Write-Host "  Intento $i/$maxAttempts..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host "[ERROR] n8n no responde despues de $maxAttempts intentos" -ForegroundColor Red
    Write-Host "  Revisa los logs: docker compose logs n8n" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] n8n disponible en http://localhost:5678" -ForegroundColor Green
Write-Host ""

# ============================================================================
#  Paso 3: Iniciar tmole (túnel a puerto 5678)
# ============================================================================
Write-Host "[3/4] Iniciando tunel tmole en puerto 5678..." -ForegroundColor Yellow

$tmoleExe = Join-Path $PSScriptRoot "tmole.exe"
if (-not (Test-Path $tmoleExe)) {
    Write-Host "[ERROR] No se encuentra tmole.exe en $PSScriptRoot" -ForegroundColor Red
    Write-Host "  Descarga tmole desde https://tunnelmole.com" -ForegroundColor Yellow
    exit 1
}

# Limpiar archivos anteriores
$tmoleOutputFile = Join-Path $PSScriptRoot "tmole_output.txt"
if (Test-Path $tmoleOutputFile) { Remove-Item $tmoleOutputFile -Force }

# Arrancar tmole en background
$tmoleProcess = Start-Process -FilePath $tmoleExe -ArgumentList "5678" `
    -RedirectStandardOutput $tmoleOutputFile `
    -NoNewWindow -PassThru

Write-Host "  tmole PID: $($tmoleProcess.Id)" -ForegroundColor Gray

# Esperar a que tmole genere la URL
$tunnelUrl = $null
$maxWait = 30

for ($i = 1; $i -le $maxWait; $i++) {
    Start-Sleep -Seconds 1

    if (Test-Path $tmoleOutputFile) {
        $content = Get-Content $tmoleOutputFile -ErrorAction SilentlyContinue
        if ($content) {
            $httpsLine = $content | Where-Object { $_ -match "^https://" } | Select-Object -First 1
            if ($httpsLine) {
                # Extraer la URL (primer token antes de espacios)
                $tunnelUrl = ($httpsLine -split '\s+')[0]
                break
            }
        }
    }

    if ($i % 5 -eq 0) {
        Write-Host "  Esperando URL del tunel... ($i/$maxWait)" -ForegroundColor Gray
    }
}

if (-not $tunnelUrl) {
    Write-Host "[ERROR] No se pudo obtener la URL del tunel" -ForegroundColor Red
    Write-Host "  Revisa tmole_output.txt para mas informacion" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Tunel activo: $tunnelUrl" -ForegroundColor Green
Write-Host ""

# ============================================================================
#  Paso 4: Registrar el túnel con el proxy de Render
# ============================================================================
Write-Host "[4/4] Registrando tunel con Render ($RENDER_URL)..." -ForegroundColor Yellow

$registerBody = @{ tunnelUrl = $tunnelUrl } | ConvertTo-Json
$registerHeaders = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $CONFIG_TOKEN"
}

$registered = $false
$maxRetries = 3

for ($retry = 1; $retry -le $maxRetries; $retry++) {
    try {
        $response = Invoke-RestMethod -Uri "$RENDER_URL/api/tunnel" `
            -Method POST `
            -Body $registerBody `
            -Headers $registerHeaders `
            -TimeoutSec 30 `
            -ErrorAction Stop

        $registered = $true
        Write-Host "[OK] Tunel registrado con Render" -ForegroundColor Green
        break
    }
    catch {
        $errorMsg = $_.Exception.Message
        Write-Host "  Intento $retry/$maxRetries fallo: $errorMsg" -ForegroundColor Gray

        if ($retry -lt $maxRetries) {
            Write-Host "  Render (plan free) puede tardar ~30s en despertar. Reintentando..." -ForegroundColor Gray
            Start-Sleep -Seconds 15
        }
    }
}

if (-not $registered) {
    Write-Host ""
    Write-Host "[AVISO] No se pudo registrar con Render, pero el tunel directo funciona" -ForegroundColor Yellow
    Write-Host "  Puedes registrar manualmente:" -ForegroundColor Yellow
    Write-Host "  curl -X POST $RENDER_URL/api/tunnel -H 'Content-Type: application/json' -H 'Authorization: Bearer $CONFIG_TOKEN' -d '{\"tunnelUrl\": \"$tunnelUrl\"}'" -ForegroundColor Gray
}

# ============================================================================
#  Resumen
# ============================================================================
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  SISTEMA LISTO" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "  n8n UI (local):    http://localhost:5678" -ForegroundColor White
Write-Host "  Tunel directo:     $tunnelUrl" -ForegroundColor White

if ($registered) {
    Write-Host "  Proxy Render:      $RENDER_URL" -ForegroundColor White
    Write-Host ""
    Write-Host "  Ejemplo webhook via Render:" -ForegroundColor Cyan
    Write-Host "  $RENDER_URL/webhook/<tu-uuid>" -ForegroundColor White
    Write-Host ""
    Write-Host "  Ejemplo webhook via tunel directo:" -ForegroundColor Cyan
    Write-Host "  $tunnelUrl/webhook/<tu-uuid>" -ForegroundColor White
}
else {
    Write-Host ""
    Write-Host "  Ejemplo webhook via tunel directo:" -ForegroundColor Cyan
    Write-Host "  $tunnelUrl/webhook/<tu-uuid>" -ForegroundColor White
}

Write-Host ""
Write-Host "  Crea un webhook en n8n (http://localhost:5678)" -ForegroundColor Gray
Write-Host "  y el UUID del webhook aparecera en la configuracion del nodo." -ForegroundColor Gray
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""

# Mantener el script corriendo
try {
    while ($true) {
        Start-Sleep -Seconds 60

        # Verificar que tmole sigue corriendo
        if ($tmoleProcess.HasExited) {
            Write-Host ""
            Write-Host "[AVISO] tmole se ha detenido. Reiniciando..." -ForegroundColor Yellow

            # Reiniciar tmole
            if (Test-Path $tmoleOutputFile) { Remove-Item $tmoleOutputFile -Force }
            $tmoleProcess = Start-Process -FilePath $tmoleExe -ArgumentList "5678" `
                -RedirectStandardOutput $tmoleOutputFile `
                -NoNewWindow -PassThru

            Start-Sleep -Seconds 10

            # Obtener nueva URL
            $content = Get-Content $tmoleOutputFile -ErrorAction SilentlyContinue
            $httpsLine = $content | Where-Object { $_ -match "^https://" } | Select-Object -First 1
            if ($httpsLine) {
                $newTunnelUrl = ($httpsLine -split '\s+')[0]
                Write-Host "  Nuevo tunel: $newTunnelUrl" -ForegroundColor Green

                # Re-registrar con Render
                $registerBody = @{ tunnelUrl = $newTunnelUrl } | ConvertTo-Json
                try {
                    Invoke-RestMethod -Uri "$RENDER_URL/api/tunnel" `
                        -Method POST -Body $registerBody `
                        -Headers $registerHeaders -TimeoutSec 30 -ErrorAction Stop
                    Write-Host "  [OK] Re-registrado con Render" -ForegroundColor Green
                }
                catch {
                    Write-Host "  [AVISO] No se pudo re-registrar con Render" -ForegroundColor Yellow
                }
            }
        }
    }
}
finally {
    # Cleanup al salir (Ctrl+C)
    Write-Host ""
    Write-Host "Deteniendo servicios..." -ForegroundColor Yellow

    if (-not $tmoleProcess.HasExited) {
        Stop-Process -Id $tmoleProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  tmole detenido" -ForegroundColor Gray
    }

    Write-Host "  Docker sigue corriendo. Usa 'docker compose down' para detenerlo." -ForegroundColor Gray
    Write-Host ""
}