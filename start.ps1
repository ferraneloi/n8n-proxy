Write-Host "Iniciando Docker..."
docker compose up -d

$env:TU_PROXY = 'https://n8n-proxy-b2m9.onrender.com'
${'TU-PROXY'} = $env:TU_PROXY
$proxyUrl = ${'TU-PROXY'}
$webhookPath = $env:WEBHOOK_PATH

if (-not $webhookPath) {
    $webhookPath = Read-Host "Introduce el path interno de webhook de n8n (por ejemplo /webhook/3bffaaea-4f6d-4e80-bf54-ca08a3a7c72b)"
}

if (-not $webhookPath.StartsWith("/")) {
    $webhookPath = "/$webhookPath"
}

Start-Sleep -Seconds 5

Write-Host "Iniciando Tunnelmole..."
Start-Process tmole -ArgumentList "5678" -NoNewWindow -RedirectStandardOutput "tmole.log"

$maxWait = 60
$elapsed = 0
$url = $null

while ($elapsed -lt $maxWait -and -not $url) {
    Start-Sleep -Seconds 2
    $elapsed += 2
    if (Test-Path "tmole.log") {
        $log = Get-Content tmole.log -Raw
        if ($log -match "https://[a-zA-Z0-9\-]+\.tunnelmole\.net") {
            $url = $matches[0]
        }
    }
}

if ($url) {
    Write-Host "Tunnelmole URL detectada: $url"

    # Actualizar proxy en Render si el servicio existe
    try {
        $body = @{ url = $url; webhookPath = $webhookPath } | ConvertTo-Json
        Invoke-RestMethod `
            -Uri "$proxyUrl/set-url" `
            -Method POST `
            -Headers @{ Authorization = "mysecret" } `
            -Body $body `
            -ContentType "application/json"
        Write-Host "Proxy en Render actualizado!"
    } catch {
        Write-Host "Advertencia: no se pudo actualizar el proxy en Render. Continuo con la URL directa de Tunnelmole."
    }

    # Generar formulario HTML local usando la URL directa de Tunnelmole
    $template = Get-Content template.html -Raw
    $final = $template -replace "__WEBHOOK_URL__", "$url$webhookPath"
    $final | Set-Content form.html

    Start-Process form.html
} else {
    Write-Host "❌ No se pudo detectar la URL de Tunnelmole después de $maxWait segundos"
}