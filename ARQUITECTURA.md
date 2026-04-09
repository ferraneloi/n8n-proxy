# 📊 ARQUITECTURA VISUAL - Tunnel N8N

## 🏠 ENTORNO LOCAL (Desarrollo)

```
┌─────────────────────────────────────────────────────────────────┐
│                     TU MÁQUINA LOCAL                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              DOCKER COMPOSE                             │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  ┌──────────────┐      ┌──────────────┐                │    │
│  │  │ PostgreSQL   │◄────►│   N8N 5678   │                │    │
│  │  │   (DB)       │      │              │                │    │
│  │  └──────────────┘      └──────────────┘                │    │
│  │                              ▲                          │    │
│  │                              │                          │    │
│  │                        ┌─────►─────┐                    │    │
│  │                        │  N8N      │                    │    │
│  │                        │ Runner    │                    │    │
│  │                        └───────────┘                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ▲                                   │
│                              │                                   │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │  PROXY NODE.JS (localhost:3000)                         │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │  GET  /              ──► Página de info                 │    │
│  │  GET  /form          ──► Formulario HTML (dinámico)     │    │
│  │  POST /webhook/test  ──► Forwardea a N8N               │    │
│  │  GET  /api/config    ──► Config JSON                    │    │
│  │  POST /api/config    ──► Actualizar config              │    │
│  │  GET  /health        ──► Health check                   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                              ▲                                   │
│                              │                                   │
│  ┌──────────────────────────┴──────────────────────────────┐    │
│  │  TUNNELMOLE (puerto 3000 expuesto)                      │    │
│  │  URL pública: https://xxxx.tunnelmole.com               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ INTERNET
                              ▼
         https://xxxx.tunnelmole.com/form
                (acceso público al formulario)
```

### Flujo de Datos en Local:

```
Usuario en navegador
         │
         ▼ ENVIAR FORMULARIO
https://xxxx.tunnelmole.com/form
         │
         ▼ POST a /webhook/test
https://xxxx.tunnelmole.com/webhook/test
         │
         ▼ TUNNELMOLE forwardea a localhost:3000
POST localhost:3000/webhook/test
         │
         ▼ PROXY forwardea a N8N
POST localhost:5678/webhook/xxx
         │
         ▼ N8N RECIBE EL DATO
Workflow se ejecuta
         │
         ▼ RESPUESTA
✓ Enviado correctamente!
```

---

## 🌐 ENTORNO PRODUCCIÓN (Render.com)

```
┌─────────────────────────────────────────────────────────────────┐
│                    RENDER.COM (Cloud)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  PROXY NODE.JS SERVICE                                  │    │
│  │  https://n8n-proxy-xxxx.onrender.com                    │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │  GET  /              ──► Página de info                 │    │
│  │  GET  /form          ──► Formulario HTML (dinámico)     │    │
│  │  POST /webhook/test  ──► Forwardea a N8N               │    │
│  │  GET  /api/config    ──► Config JSON                    │    │
│  │  POST /api/config    ──► Actualizar config              │    │
│  │  GET  /health        ──► Health check                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              │ FORWARDEA A                       │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  N8N EN PRODUCCIÓN                                      │    │
│  │  (Render, AWS, DigitalOcean, etc)                       │    │
│  │  https://tu-n8n-produccion.onrender.com                │    │
│  │  Recibe: /webhook/tu-id-real                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de Datos en Producción:

```
Usuario en navegador
         │
         ▼ ACCEDE A
https://n8n-proxy-xxxx.onrender.com/form
         │
         ▼ CARGA CONFIGURACIÓN
GET /api/config
         │
         └─► webhookUrl = "https://n8n-proxy-xxxx.onrender.com/webhook/test"
         │
         ▼ ENVIAR FORMULARIO
POST /webhook/test
         │
         ▼ PROXY FORWARDEA
POST https://tu-n8n-produccion.onrender.com/webhook/tu-id
         │
         ▼ N8N RECIBE
Workflow se ejecuta
         │
         ▼ RESPUESTA
✓ Enviado correctamente!
```

---

## 🔄 DIFERENCIAS CLAVE

| Aspecto | Local | Producción |
|---------|-------|-----------|
| **Proxy URL** | http://localhost:3000 | https://n8n-proxy-xxxx.onrender.com |
| **Target URL** | http://localhost:5678 | https://tu-n8n-produccion.com |
| **Webhook URL (público)** | https://xxxx.tunnelmole.com/webhook/test | https://n8n-proxy-xxxx/webhook/test |
| **Webhook URL (interno)** | http://localhost:5678/webhook/xxx | https://tu-n8n-prod/webhook/xxx |
| **Disponibilidad** | Solo en tu red local | En Internet, cualquier parte del mundo |
| **Vía** | Tunnelmole (proxy túnel) | Directo vía HTTPS |

---

## 📝 CONFIGURACIÓN POR ENTORNO

### Local (.env)
```
PUBLIC_URL=http://localhost:3000      # Donde corre el proxy
TARGET_URL=http://localhost:5678      # Donde corre N8N
WEBHOOK_PATH=/webhook/test            # Path del webhook
PORT=3000                             # Puerto del proxy
NODE_ENV=development
```

### Producción (render.yaml)
```
PUBLIC_URL=https://n8n-proxy-xxxx.onrender.com  # Render asigna URL
TARGET_URL=https://tu-n8n-real.com              # Tu N8N en producción
WEBHOOK_PATH=/webhook/tu-id-real               # Path real de N8N
PORT=3000                                       # Render lo asigna
NODE_ENV=production
CONFIG_TOKEN=algo-muy-seguro                    # Token fuerte
```

---

## 🔐 SEGURIDAD POR CAPAS

```
┌─────────────────────────────────────────┐
│ INTERNET PÚBLICA                        │
│  • Usuarios acceden a /form             │
│  • Pueden ver el formulario             │
│  • NO pueden ver configuración interna  │
├─────────────────────────────────────────┤
│ API PÚBLICA DE LECTURA                  │
│  • GET /api/config (público)            │
│  • Ve la configuración actual           │
│  • Útil para debugging                  │
├─────────────────────────────────────────┤
│ API PROTEGIDA                           │
│  • POST /api/config (requiere token)    │
│  • CONFIG_TOKEN: Bearer <token>         │
│  • Solo admin puede actualizar config   │
├─────────────────────────────────────────┤
│ BASE DE DATOS (N8N)                     │
│  • Conectada solo a N8N                 │
│  • No accesible desde proxy             │
│  • Protegida por firewall               │
└─────────────────────────────────────────┘
```

---

## 🚀 FLUJO DE DESPLIEGUE

```
Local Development
       │
       ├─ .\start.ps1         ──► Docker + N8N listo
       ├─ npm start            ──► Proxy en puerto 3000
       ├─ tmole 3000           ──► URL pública generada
       │
       ▼
Pruebas Locales
       │
       ├─ http://localhost:3000/form     ──► Formulario funciona?
       ├─ https://xxxx.tunnelmole.com/form ──► Accesible públicamente?
       ├─ N8N recibe datos?               ──► Workflow ejecuta?
       │
       ▼
TO PRODUCTION: git push
       │
       ▼
Render Detects Push
       │
       ├─ npm install          ──► Instala dependencias
       ├─ node server.js       ──► Inicia proxy
       │
       ▼
Verificación
       │
       ├─ https://n8n-proxy-xxxx.onrender.com/form   ──► Carga?
       ├─ Formulario funciona?
       ├─ N8N recibe datos?
       │
       ▼
✨ PRODUCCIÓN LISTA
```

---

## 💡 PUNTOS CLAVE DEL ARREGLO

### ✅ Antes (ROTO):
- ❌ `TARGET_URL=localhost:5678` en Render
- ❌ Formularios con URLs hardcodeadas
- ❌ No servía archivos estáticos
- ❌ No había endpoint de configuración
- ❌ Imposible usar en Render

### ✅ Después (ARREGLADO):
- ✅ URLs dinámicas desde servidor
- ✅ Formularios se cargan desde `/form`
- ✅ Config inyectada en tiempo de carga
- ✅ Variables por entorno (.env vs render.yaml)
- ✅ Funciona en local, Tunnelmole Y Render

---

## 📡 PROTOCOLO WEBHOOK

### Petición del Formulario
```json
POST /webhook/test
Content-Type: application/json

{
  "nombre": "Juan"
}
```

### Lo que hace el Proxy
```flow
1. Recibe: POST /webhook/test { nombre: "Juan" }
2. Obtiene TARGET_URL de env: http://localhost:5678
3. Obtiene WEBHOOK_PATH de env: /webhook/abc123
4. Construye: http://localhost:5678/webhook/abc123
5. Forwardea: POST con mismo body
6. Recibe respuesta de N8N
7. Retorna respuesta al cliente
```

### Respuesta de N8N
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "success",
  "message": "Workflow ejecutado"
}
```

---

**✨ La arquitectura está diseñada para ser flexible, escalable y segura.**
