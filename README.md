# n8n Webhook Tunnel

Expone los webhooks de tu n8n local a internet usando un proxy en Render + túnel con [Tunnelmole](https://tunnelmole.com).

## Cómo funciona

```
Usuario externo (cualquier PC)
        │
        ▼
Render Proxy (URL estable en la nube)
https://n8n-proxy-b2m9.onrender.com/webhook/UUID
        │
        ▼
Túnel tmole (URL dinámica)
https://xxx.tunnelmole.net/webhook/UUID
        │
        ▼
Tu PC local → Docker → n8n
http://localhost:5678/webhook/UUID
```

**Resultado:** Cualquier persona puede llamar a tus webhooks de n8n a través de la URL de Render, sin importar que n8n esté en tu PC local.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo
- [Node.js](https://nodejs.org/) >= 18
- `tmole.exe` en la raíz del proyecto ([descargar](https://tunnelmole.com))
- Un Web Service en [Render.com](https://render.com) conectado a este repositorio

## Setup inicial (una vez)

### 1. Clonar y configurar

```bash
git clone https://github.com/ferraneloi/n8n-proxy.git
cd n8n-proxy
cp .env.example .env
```

### 2. Editar `.env`

```env
# La URL de tu servicio en Render
RENDER_URL=https://tu-servicio.onrender.com

# Token secreto (debe coincidir con el de Render)
CONFIG_TOKEN=tu-token-secreto
```

### 3. Crear el servicio en Render

1. Ve a [Render Dashboard](https://dashboard.render.com)
2. Crea un **New Web Service** → conecta tu repositorio de GitHub
3. Render usará `render.yaml` automáticamente
4. En **Environment**, asegúrate de que `CONFIG_TOKEN` coincida con tu `.env`

### 4. Descargar tmole

Descarga `tmole.exe` desde [tunnelmole.com](https://tunnelmole.com) y colócalo en la raíz del proyecto.

## Uso diario

### Arrancar todo

```powershell
.\start.ps1
```

Esto automáticamente:
1. ✅ Arranca Docker Compose (n8n + PostgreSQL)
2. ✅ Espera a que n8n esté listo
3. ✅ Inicia tmole (túnel al puerto 5678)
4. ✅ Registra la URL del túnel con el proxy de Render

### Crear un webhook en n8n

1. Abre n8n en `http://localhost:5678`
2. Crea un workflow con un nodo **Webhook**
3. El nodo mostrará un path como `/webhook/abc-123-def`
4. Activa el workflow

### Acceder al webhook desde fuera

Usa la URL de Render + el path del webhook:

```
https://tu-servicio.onrender.com/webhook/abc-123-def
```

Ejemplo con curl:
```bash
curl -X POST https://tu-servicio.onrender.com/webhook/abc-123-def \
  -H "Content-Type: application/json" \
  -d '{"nombre": "test"}'
```

### Parar

- `Ctrl+C` en la terminal del script (detiene tmole)
- `docker compose down` para detener n8n

## Endpoints del proxy (Render)

| Método | Path | Descripción |
|--------|------|-------------|
| `ANY` | `/webhook/*` | Proxy a n8n (webhooks de producción) |
| `ANY` | `/webhook-test/*` | Proxy a n8n (webhooks de test) |
| `POST` | `/api/tunnel` | Registrar URL del túnel (requiere token) |
| `GET` | `/api/status` | Ver estado del túnel |
| `GET` | `/health` | Health check |
| `GET` | `/` | Página de estado |

## Estructura del proyecto

```
├── server.js           # Proxy (se ejecuta en Render)
├── docker-compose.yml  # n8n + PostgreSQL (se ejecuta local)
├── init-data.sh        # Script init de PostgreSQL
├── start.ps1           # Script de inicio (arranca todo)
├── render.yaml         # Configuración de Render
├── package.json        # Dependencias Node.js
├── .env                # Configuración local (no se sube a Git)
├── .env.example        # Ejemplo de configuración
└── tmole.exe           # Tunnelmole (no se sube a Git)
```

## Solución de problemas

### "Tunnel not configured" al llamar al webhook
El proxy de Render no tiene registrada ninguna URL de túnel. Ejecuta `.\start.ps1` en tu PC.

### Render tarda en responder (~30s)
El plan gratuito de Render duerme el servicio tras 15 min de inactividad. La primera petición lo despierta (~30s).

### tmole se desconecta
El script `start.ps1` detecta automáticamente si tmole se cae y lo reinicia, re-registrando con Render.

### n8n no arranca
Verifica que Docker Desktop esté corriendo: `docker compose logs n8n`
