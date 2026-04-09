# N8N Webhook Proxy con Tunnelmole

Sistema completo para exponer webhooks de N8N en localhost a través de Tunnelmole y desplegar en Render con un proxy Node.js/Express.

## 🏗️ Arquitectura

### Entorno Local (Desarrollo)
```
┌─────────────────────────────────────────────────────┐
│ Docker Compose                                       │
├─────────────────────────────────────────────────────┤
│ • PostgreSQL (BD para N8N)                          │
│ • N8N (http://localhost:5678)                      │
│ • N8N Runner                                        │
└─────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│ Proxy Node.js (http://localhost:3000)               │
│ • Recibe peticiones en /webhook/test                │
│ • Forwardea a http://localhost:5678/webhook/test   │
└─────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│ Tunnelmole (https://xxxx.tunnelmole.com)            │
│ • Expone localhost:3000 en URL pública              │
│ • Formulario accesible desde cualquier lugar        │
└─────────────────────────────────────────────────────┘
```

### Entorno de Producción (Render)
```
┌─────────────────────────────────────────────────────┐
│ Render Web Service (Node.js)                        │
│ • Proxy corriendo en https://n8n-proxy.onrender.com │
│ • Conecta a N8N en producción                       │
│ • Expone webhook público                           │
└─────────────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────────────┐
│ N8N en Producción                                   │
│ (Render o servicio externo)                        │
└─────────────────────────────────────────────────────┘
```

## 📋 Requisitos

### Local
- Node.js 14+
- Docker y Docker Compose
- Tunnelmole CLI (`npm install -g tunnelmole`)
- PowerShell (en Windows)

### Render
- Repositorio Git con este código
- Cuenta en Render.com
- URL de N8N en producción

## 🚀 Inicio Rápido Local

### 1️⃣ Preparar variables de entorno

```bash
# El archivo .env ya viene preconfigurado con:
# - PostgreSQL: pguser/pgpass
# - N8N: http://localhost:5678
# - Proxy: http://localhost:3000
# - Webhook path: /webhook/test
```

### 2️⃣ Instalar dependencias

```bash
npm install
```

### 3️⃣ Ejecutar el script de inicio

En PowerShell:
```powershell
.\start.ps1
```

Este script:
- ✅ Inicia Docker Compose (PostgreSQL, N8N, N8N Runner)
- ✅ Espera a que N8N esté disponible
- ✅ Te pide el webhook path de N8N
- ✅ Inicia el proxy Node.js

### 4️⃣ Iniciar Tunnelmole en otra terminal

```bash
tmole 3000
```

Esto te dará una URL como: `https://xxxx.tunnelmole.com`

### 5️⃣ Acceder al formulario

- **Local**: http://localhost:3000/form
- **Público (Tunnelmole)**: https://xxxx.tunnelmole.com/form

## 📝 Obtener el Webhook Path de N8N

1. Abre http://localhost:5678
2. En tu workflow, añade un nodo "Webhook"
3. Copia el path que genera (ej: `/webhook/3bffaaea-4f6d-4e80-bf54-ca08a3a7c72b`)
4. El script te pedirá que lo introduzcas

## 🌐 Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/` | GET | Página de inicio con info del servidor |
| `/form` | GET | Formulario HTML con URL dinámicamente inyectada |
| `/webhook/test` | POST | Webhook público de prueba |
| `/webhook/*` | POST/GET/etc | Proxy genérico para cualquier webhook |
| `/api/config` | GET | Obtener configuración actual en JSON |
| `/api/config` | POST | Actualizar configuración (requiere token) |
| `/health` | GET | Health check |

## 🔧 Configuración Dinámica

### Obtener configuración actual:
```bash
curl http://localhost:3000/api/config
```

### Actualizar configuración:
```bash
curl -X POST http://localhost:3000/api/config \
  -H "Authorization: Bearer mysecret" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "http://n8n.example.com:5678",
    "webhookPath": "/webhook/nuevo-path",
    "publicUrl": "https://mi-proxy.com"
  }'
```

## 🚀 Desplegar en Render

### 1. Conectar el repositorio

1. Sube este código a GitHub
2. Abre https://render.com
3. Crea nuevo "Web Service"
4. Conecta tu repositorio GitHub
5. Render detectará automáticamente que es Node.js

### 2. Configurar variables de entorno en Render

En el panel de Render, añade estas variables:

```
PUBLIC_URL = https://n8n-proxy-xxxx.onrender.com
TARGET_URL = https://tu-n8n-produccion.onrender.com
WEBHOOK_PATH = /webhook/tu-webhook-id
CONFIG_TOKEN = tu-token-seguro-aqui
NODE_ENV = production
```

**⚠️ IMPORTANTE**: 
- `TARGET_URL` debe ser tu N8N en producción (no localhost)
- `PUBLIC_URL` debe ser la URL de tu servicio en Render
- Crea un `CONFIG_TOKEN` fuerte y distinto a "mysecret"

### 3. Desplegar

Render desplegará automáticamente cada vez que hagas push a `main`.

```bash
git add .
git commit -m "Deploy N8N proxy to Render"
git push origin main
```

## 🔍 Debugging

### Ver logs locales
```bash
node server.js
```

### Ver logs en Render
En el panel de Render → Logs

### Probar el webhook manualmente

```bash
# Local
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Test"}'

# Render
curl -X POST https://n8n-proxy-xxxx.onrender.com/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Test"}'
```

## ⚙️ Variables de Entorno

| Variable | Defecto | Descripción |
|----------|---------|-------------|
| `PORT` | 3000 | Puerto del servidor proxy |
| `PUBLIC_URL` | http://localhost:3000 | URL pública del proxy |
| `TARGET_URL` | http://localhost:5678 | URL de N8N |
| `WEBHOOK_PATH` | /webhook/test | Path del webhook en N8N |
| `CONFIG_TOKEN` | mysecret | Token para actualizar config |
| `NODE_ENV` | development | Entorno (development/production) |

## 📦 Estructura del Proyecto

```
tunnel_n8n/
├── server.js              # Servidor proxy Express
├── package.json           # Dependencias Node.js
├── docker-compose.yml     # Configuración Docker (N8N + PostgreSQL)
├── render.yaml           # Configuración de Render
├── form.html             # Formulario HTML (dinámico)
├── template.html         # Alternativa de formulario
├── .env                  # Variables de entorno local
├── .env.example          # Plantilla de .env
├── start.ps1             # Script de inicio (Windows/PowerShell)
├── init-data.sh          # Script de init de PostgreSQL
└── README.md             # Esta guía
```

## 🐛 Problemas Comunes

### "Cannot find tmole"
```bash
npm install -g tunnelmole
```

### "Docker Compose no inicia"
```bash
# Verificar que Docker está corriendo
docker ps

# Ver logs de Docker Compose
docker compose logs -f
```

### "N8N no está disponible"
```bash
# Ver estado de contenedores
docker compose ps

# Ver logs de N8N
docker compose logs -f n8n
```

### "Render elige localhost en TARGET_URL"
Edita `render.yaml` y asegúrate de que `TARGET_URL` apunta a tu N8N en producción, NO a localhost.

### "El webhook no forwardea a N8N"
1. Verifica que TARGET_URL es correcto: `curl $TARGET_URL`
2. Verifica que WEBHOOK_PATH es correcto (obtener de N8N)
3. Revisa los logs: `node server.js`

## 📚 Referencias

- [N8N Documentation](https://docs.n8n.io)
- [Tunnelmole](https://tunnelmole.com/)
- [Render.com](https://render.com)
- [Express.js](https://expressjs.com)

## 📄 Licencia

MIT

---

**Última actualización**: Abril 2026
**Versión**: 1.0.0
