# ⚡ QUICK START - 5 Minutos

## 🎯 Objetivo
Ejecutar el sistema completo en local y verificar que funciona.

---

## ✅ PASO 1: Requisitos (2 min)

Verifica que tienes:
```bash
node --version          # v14+
npm --version           # v6+
docker --version        # Docker Desktop en Windows
tmole --version         # Si no: npm install -g tunnelmole
```

---

## ✅ PASO 2: Instalar & Iniciar (3 min)

**Terminal 1: Instala y arranca el proxy**
```bash
cd c:\tunnel_n8n
npm install
npm start
```

Debes ver el banner del proxy iniciado correctamente.

**Terminal 2: Inicia Docker + N8N**

Con PowerShell:
```powershell
.\start.ps1
```

Con CMD:
```cmd
start.bat
```

El script automáticamente:
- Inicia Docker Compose
- Espera a que N8N esté listo (máx 30 segundos)
- Te pide el webhook path de N8N
- Muestra las URLs disponibles

---

## ✅ PASO 3: Acceder al Proxy (30 seg)

**En el navegador:**
```
http://localhost:3000
```

Debes ver:
- Última fila: `Webhook URL: http://localhost:3000/webhook/test`
- Link A: `Ir al formulario →`
- Link B: `Ver configuración JSON →`

---

## ✅ PASO 4: Probar el Formulario

```
http://localhost:3000/form
```

- Escribe un nombre cualquiera
- Click en "Enviar"
- Debe decir "✓ ¡Enviado correctamente!"

✅ **SI LLEGA AQUÍ, TODO LOCAL FUNCIONA**

---

## 🌍 PASO 5: Exponer con Tunnelmole (1 min)

**Terminal 3: Inicia Tunnelmole**
```bash
tmole 3000
```

Verás algo como:
```
Forwarding: https://xxxx.tunnelmole.com → localhost:3000
```

Copia esa URL.

---

## 🧪 PASO 6: Probar Públicamente

```
https://xxxx.tunnelmole.com/form
```

Abre en navegador. Debe funcionar igual que en local.

✅ **System works!**

---

## 🚀 AHORA A RENDER (cuando estés listo)

```bash
# 1. Edita render.yaml con TUS valores
#    TARGET_URL = tu N8N en producción (NO localhost!)
#    PUBLIC_URL = tu URL en Render

# 2. GitHub
git add .
git commit -m "Ready for Render"
git push

# 3. Render detecta, compila y despliega automáticamente
```

---

## 🆘 Si algo falla

### "Cannot to connect to Docker daemon"
```bash
# Abre Docker Desktop
# Espera a que esté listo (tarda 30s)
docker ps  # Debe funcionar
```

### "Port 3000 already in use"
```bash
# Puerto ocupado por otra app
PORT=3001 node server.js
# Accede a http://localhost:3001
```

### "N8N no responde"
```bash
# Espera 30 segundos más
docker compose logs n8n
# Ver qué está pasando
```

### "Tunnelmole not found"
```bash
npm install -g tunnelmole
tmole 3000
```

### "Formulario recibe error"
```bash
# Ver en consola del navegador (F12 → Console)
# Debe haber algo como:
# ✓ Webhook URL cargada: http://localhost:3000/webhook/test

# Si falla, prueba directamente:
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Test"}'
```

---

## 📌 Endpoints que Necesitas Recordar

| URL | Uso |
|-----|-----|
| `http://localhost:3000` | Página principal |
| `http://localhost:3000/form` | Formulario para enviar |
| `http://localhost:3000/api/config` | Ver configuración actual |
| `http://localhost:5678` | N8N UI (crea workflows) |

---

## 🎓 Próximos Pasos

1. **Abre N8N**: http://localhost:5678
2. **Crea un workflow** con nodo "Webhook"
3. **Copia el webhook path**: `/webhook/abc123...`
4. **Actualiza `.env`**: `WEBHOOK_PATH=/webhook/abc123...`
5. **Reinicia proxy**: `npm start`
6. **Prueba formulario**: http://localhost:3000/form
7. **Verifica que N8N recibe datos** ✓

---

## 📖 Documentación Completa

- `README.md` - Guía detallada
- `ARQUITECTURA.md` - Cómo funciona el sistema
- `CAMBIOS.md` - Qué se arregló
- `DEPLOYMENT_CHECKLIST.md` - Paso a paso para Render

---

## ✨ ÉXITO!

Si llegaste hasta aquí significa que tienes:

✅ N8N corriendo en http://localhost:5678
✅ Proxy corriendo en http://localhost:3000
✅ Formulario funcional
✅ Webhooks trabajando
✅ Todo listo para producción en Render

**Siguiente paso:** Edita `render.yaml` con tus valores reales y haz `git push`

---

**¿Dudas?** Revisa:
- Logs de terminal
- Console del navegador (F12)
- Docker logs: `docker compose logs`
- Documentación en README.md
