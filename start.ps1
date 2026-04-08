Write-Host "Iniciando Docker..."
docker compose up -d

Start-Sleep -Seconds 5

Write-Host "Iniciando Tunnelmole..."
Start-Process tmole -ArgumentList "5678" -NoNewWindow -RedirectStandardOutput "tmole.log"

Start-Sleep -Seconds 5

Write-Host "Obteniendo URL pública de Tunnelmole..."
$log = Get-Content tmole.log -Raw

if ($log -match "https://[a-zA-Z0-9\-]+\.tunnelmole\.net") {
    $url = $matches[0]
    Write-Host "Tunnelmole URL detectada: $url"

    # Actualizar proxy en Render
    $body = @{ url = $url } | ConvertTo-Json
    Invoke-RestMethod `
        -Uri "https://TU-PROXY.onrender.com/set-url" `
        -Method POST `
        -Headers @{ Authorization = "mysecret" } `
        -Body $body `
        -ContentType "application/json"

    Write-Host "Proxy actualizado!"

    # Generar formulario HTML local
    $template = Get-Content template.html -Raw
    $final = $template -replace "__WEBHOOK_URL__", "https://TU-PROXY.onrender.com/webhook/test"
    $final | Set-Content form.html

    Start-Process form.html
}
else {
    Write-Host "❌ No se pudo detectar la URL de Tunnelmole"
}