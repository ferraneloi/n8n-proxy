# ============================================================================
#  n8n Webhook Tunnel — Start Script v2
# ============================================================================

# --- Cargar configuración desde .env ---
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim(); $val = $parts[1].Trim()
                [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            }
        }
    }
}

$RENDER_URL = $env:RENDER_URL; $CONFIG_TOKEN = $env:CONFIG_TOKEN; $N8N_API_KEY = $env:N8N_API_KEY
if (-not $CONFIG_TOKEN) { $CONFIG_TOKEN = "mysecret" }

if (-not $RENDER_URL) { Write-Host "[ERROR] Falta RENDER_URL en .env" -ForegroundColor Red; exit 1 }

# --- 1. Docker ---
Write-Host "[1/4] Arrancando Docker..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Docker fallo" -ForegroundColor Red; exit 1 }

# --- 2. n8n health ---
Write-Host "[2/4] Esperando n8n..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$ready = $false; for ($i=1; $i -le 30; $i++) {
    try { if ((Invoke-WebRequest "http://localhost:5678" -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode -eq 200) { $ready=$true; break } } catch {}
    Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host "[ERROR] n8n no responde" -ForegroundColor Red; exit 1 }

# --- 3. tmole ---
Write-Host "[3/4] Iniciando tunel..." -ForegroundColor Yellow
$tmoleOutputFile = Join-Path $PSScriptRoot "tmole_output.txt"
if (Test-Path $tmoleOutputFile) { Remove-Item $tmoleOutputFile -Force }

$tmoleProcess = Start-Process -FilePath (Join-Path $PSScriptRoot "tmole.exe") -ArgumentList "5678" -RedirectStandardOutput $tmoleOutputFile -NoNewWindow -PassThru

$tunnelUrl = $null; for ($i=1; $i -le 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $tmoleOutputFile) {
        $httpsLine = Get-Content $tmoleOutputFile | Where-Object { $_ -match "^https://" } | Select-Object -First 1
        if ($httpsLine) { $tunnelUrl = ($httpsLine -split '\s+')[0]; break }
    }
}
if (-not $tunnelUrl) { Write-Host "[ERROR] tmole no dio URL" -ForegroundColor Red; exit 1 }

# --- 4. Registrar ---
Write-Host "[4/4] Registrando con Render..." -ForegroundColor Yellow
$regBody = @{ tunnelUrl = $tunnelUrl; n8nApiKey = $N8N_API_KEY } | ConvertTo-Json
$regHeaders = @{ "Content-Type"="application/json"; "Authorization"="Bearer $CONFIG_TOKEN" }
try {
    Invoke-RestMethod -Uri "$RENDER_URL/api/tunnel" -Method POST -Body $regBody -Headers $regHeaders -ErrorAction Stop
    Write-Host "[OK] Listo: $RENDER_URL" -ForegroundColor Green
} catch {
    Write-Host "[AVISO] Error registro: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "---"
Write-Host "Dashboard: $RENDER_URL/dashboard"
Write-Host "Formulario: $RENDER_URL/form"
Write-Host "Presiona Ctrl+C para salir"
Write-Host "---"

# --- Watchdog ---
try {
    while ($true) {
        Start-Sleep -Seconds 60
        if ($tmoleProcess.HasExited) {
            Write-Host "[!] tmole caido. Reiniciando..." -ForegroundColor Yellow
            $tmoleProcess = Start-Process -FilePath (Join-Path $PSScriptRoot "tmole.exe") -ArgumentList "5678" -RedirectStandardOutput $tmoleOutputFile -NoNewWindow -PassThru
            Start-Sleep -Seconds 10
            $newUrl = (Get-Content $tmoleOutputFile | Where-Object { $_ -match "^https://" } | Select-Object -First 1 -ErrorAction SilentlyContinue) -split '\s+' | Select-Object -First 1
            if ($newUrl) {
                $regBody = @{ tunnelUrl = $newUrl; n8nApiKey = $N8N_API_KEY } | ConvertTo-Json
                Invoke-RestMethod -Uri "$RENDER_URL/api/tunnel" -Method POST -Body $regBody -Headers $regHeaders -ErrorAction SilentlyContinue
            }
        }
    }
} finally {
    if ($tmoleProcess -and -not $tmoleProcess.HasExited) { Stop-Process -Id $tmoleProcess.Id -Force }
}