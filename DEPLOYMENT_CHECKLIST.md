# ✅ DEPLOYMENT CHECKLIST

## 🏠 ANTES DE DESPLEGAR EN RENDER

### Paso 1: Verifica que todo funciona en Local

- [ ] `npm install` ejecutado sin errores
- [ ] `.env` contiene `TARGET_URL=http://localhost:5678`
- [ ] `docker-compose up -d` inicia sin errores
- [ ] N8N está accesible en http://localhost:5678
- [ ] Has obtenido el webhook path de N8N (ej: `/webhook/abc123`)

### Paso 2: Prueba el Proxy Localmente

```bash
# Terminal 1: Inicia el proxy
npm start

# Terminal 2: Prueba los endpoints
curl http://localhost:3000                    # Debe ver HTML
curl http://localhost:3000/api/config         # Ver config JSON
curl http://localhost:3000/form              # Ver formulario HTML
```

### Paso 3: Prueba con Tunnelmole

```bash
# Terminal 3: Inicia tunnelmole
tmole 3000

# Copia la URL que genera (ej: https://xxxx.tunnelmole.com)
# Prueba en navegador: https://xxxx.tunnelmole.com/form
# Completa el formulario y verifica que N8N recibe el dato
```

---

## 🚀 DESPLIEGUE EN RENDER

### Paso 1: Preparar Aplicación N8N en Producción

**OPCIÓN A: N8N en Render también**
- [ ] Crea un nuevo Web Service en Render para n8n
- [ ] Espera a que esté listo en: `https://tu-n8n.onrender.com`
- [ ] Abre la UI de N8N y crea tu workflow
- [ ] Obtén el webhook path de N8N

**OPCIÓN B: N8N en otro servicio (AWS, DigitalOcean, etc)**
- [ ] N8N está funcionando en producción en: `https://...`
- [ ] Es accesible desde internet
- [ ] Tienes el webhook path correcto

### Paso 2: Actualizar render.yaml

```yaml
services:
  - type: web
    name: n8n-proxy
    env: node
    branch: main
    envVars:
      - key: PUBLIC_URL
        value: https://n8n-proxy-xxxx.onrender.com  # TU URL EN RENDER
      - key: TARGET_URL
        value: https://tu-n8n-produccion.com        # URL DEL N8N REAL
      - key: WEBHOOK_PATH
        value: /webhook/tu-id-aqui                 # PATH REAL DE N8N
      - key: CONFIG_TOKEN
        value: algo-muy-seguro-aleatorio            # GENERADO POR TI
      - key: NODE_ENV
        value: production
```

**❌ ERRORES COMUNES A EVITAR:**
- `TARGET_URL: http://localhost:5678` - ❌ NUNCA!
- `PUBLIC_URL: http://localhost:3000` - ❌ NUNCA!
- `CONFIG_TOKEN: mysecret` - ❌ NO en producción!
- Olvidar el WEBHOOK_PATH - ❌ Necesario!

### Paso 3: Preparar Git

```bash
# Asegúrate de que .gitignore es correcto
git add .gitignore

# Verifica que no incluyes archivos sensibles
git status
# No debe haber .env (solo .env.example)

# Commit final
git add render.yaml server.js form.html template.html package.json README.md CAMBIOS.md
git commit -m "Fix: N8N Proxy ready for Render deployment

- server.js now serves static files and injects webhook URLs dynamically
- render.yaml has correct production configuration
- form.html and template.html load config from server
- Added comprehensive documentation
- Fixed localhost hardcoding issues"

git push origin main
```

### Paso 4: Conectar Render

1. Abre https://render.com
2. Crea un nuevo **Web Service**
3. Conecta tu repositorio GitHub
4. Selecciona la rama `main`
5. Render debería detectar automáticamente Node.js
6. **Importante:** Añade las mismas variables de entorno que en `render.yaml`

### Paso 5: Despliegue

1. Click en "Deploy"
2. Espera 2-3 minutos
3. Verifica que dice "Live"

---

## 🧪 VERIFICACIÓN POST-DESPLIEGUE

### Paso 1: Verifica que el proxy responde

```bash
# Reemplaza con tu URL real de Render
PROXY_URL="https://tu-proxy.onrender.com"

curl $PROXY_URL                     # Debe ver HTML
curl $PROXY_URL/api/config          # Debe ver JSON con config correcta
curl $PROXY_URL/health              # Debe ver {"status":"ok"}
```

### Paso 2: Abre el formulario

```
https://tu-proxy.onrender.com/form
```

- [ ] Se carga correctamente
- [ ] El campo de entrada está visible
- [ ] El botón "Enviar" está funcional

### Paso 3: Prueba enviando datos

1. Abre el formulario
2. Introduce un nombre
3. Click en "Enviar"
4. Debe aparecer "✓ ¡Enviado correctamente!"
5. Verifica en N8N que recibió el dato

---

## 🔧 TROUBLESHOOTING

### "Application build failed"
```bash
git log --oneline -5          # Ver último commit
git push --force origin main  # Reintentar push
```

### "Cannot find module 'express'"
```bash
# Render no ejecutó npm install
# Ve a Settings y verifica:
# - Build Command: npm install
# - Start Command: node server.js
```

### "Cannot GET /form"
```bash
# server.js no está sirviendo archivos estáticos
# Verifica que server.js tiene:
# app.use(express.static(...))
# app.get("/form", ...)
```

### "Webhook forwarding fails"
```bash
# Ver logs en Render dashboard
# Verifica TARGET_URL es correcto
# Verifica WEBHOOK_PATH es correcto
curl https://n8n-produccion/webhook/path  # Probar directamente
```

### "CONFIG_TOKEN error"
```bash
# Solo importa si usas POST /api/config
# Para el formulario no afecta
# Ignora este error si solo usas GET
```

---

## 📊 MONITOREO CONTINUO

### Logs en Render

```bash
# En el panel de Render:
# Dashboard → tu-proxy → Logs (arriba a la derecha)

# Busca líneas como:
# "[WEBHOOK] Recibiendo petición"
# "[PROXY] Forwardeando a..."
# Para verificar que funciona
```

### Configuración dinámica

```bash
# Si necesitas cambiar TARGET_URL sin redeploy:
PROXY_URL="https://tu-proxy.onrender.com"
NEW_TARGET="https://nuevo-n8n.com"
TOKEN="tu-config-token"

curl -X POST $PROXY_URL/api/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"targetUrl\": \"$NEW_TARGET\"}"
```

---

## ✨ DONE!

Cuando sees esto significa que has completado:

- ✅ N8N funcionando en producción
- ✅ Proxy desplegado en Render
- ✅ Formulario accesible públicamente
- ✅ Webhooks funcionando end-to-end
- ✅ Documentación actualizada
- ✅ Proyecto listo para clientes

**Felicidades! El sistema está en producción.** 🚀

---

## 📞 SOPORTE

Si algo falla:

1. **Verifica los logs:** Dashboard Render → Logs
2. **Prueba endpoint por endpoint:**
   ```bash
   curl https://tu-proxy/
   curl https://tu-proxy/health
   curl https://tu-proxy/api/config
   ```
3. **Verifica variables:**
   ```bash
   # En Render dashboard → Environment
   # Deben coincidir con render.yaml
   ```
4. **Prueba N8N directamente:**
   ```bash
   curl https://tu-n8n/
   ```
5. **Re-deploy forzado:**
   ```bash
   git commit --allow-empty -m "Redeploy"
   git push
   ```

---

**Última actualización:** Abril 2026
**Versión:** 1.0.0 - Production Ready
