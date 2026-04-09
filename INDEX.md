# 📚 ÍNDICE DE DOCUMENTACIÓN

## 🎯 ¿DÓNDE BUSCO QUÉ?

Usa este índice para encontrar la documentación que necesitas rápidamente.

---

## ⚡ EMPEZAR RÁPIDO (5 minutos)

**Si tienes prisa:**
- **📄 [QUICK_START.md](QUICK_START.md)** - Inicia todo en 5 min

---

## 📖 DOCUMENTACIÓN PRINCIPAL

### Para Entender el Proyecto

| Documento | Duración | Para Quién | Contenido |
|-----------|----------|-----------|----------|
| **[README.md](README.md)** | 20 min | Todos | Guía completa, requisitos, todos los endpoints |
| **[ARQUITECTURA.md](ARQUITECTURA.md)** | 15 min | Desarrolladores | Diagramas, flujos, cómo funciona todo |
| **[CAMBIOS.md](CAMBIOS.md)** | 10 min | Técnicos | Qué se arregló, antes/después |
| **[CHANGELOG.md](CHANGELOG.md)** | 5 min | Admin | Lista de archivos modificados |

### Para Desplegar

| Documento | Duración | Para Quién | Contenido |
|-----------|----------|-----------|----------|
| **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** | 30 min | DevOps | Paso a paso para Render, verificaciones, troubleshooting |

---

## 🔍 POR TAREA

### "Quiero empezar ahora mismo"
1. Lee [QUICK_START.md](QUICK_START.md) (5 min)
2. Ejecuta: `npm install && npm start`
3. Abre: http://localhost:3000/form

### "Quiero entender cómo funciona"
1. Mira [ARQUITECTURA.md](ARQUITECTURA.md) (15 min)
2. Lee [README.md](README.md) - sección Endpoints (10 min)
3. Prueba en local

### "Quiero desplegar en Render"
1. Lee [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
2. Verifica que tengas N8N en producción
3. Edita `render.yaml` con tus valores
4. `git push`

### "Algo no funciona"
1. Ve a [QUICK_START.md](QUICK_START.md) - Sección "Si algo falla"
2. Después a [README.md](README.md) - Sección "Debugging"
3. Finalmente [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - "Troubleshooting"

### "Quiero saber qué cambió"
1. Mira [CAMBIOS.md](CAMBIOS.md) (resumen ejecutivo)
2. Después [CHANGELOG.md](CHANGELOG.md) (detalles de archivos)

---

## 📊 ESTRUCTURA DE ARCHIVOS

```
tunnel_n8n/
├── 📁 CÓDIGO
│   ├── server.js              ← El proxy (refactorizado)
│   ├── package.json           ← Dependencias
│   ├── form.html              ← Formulario dinámico
│   ├── template.html          ← Alternativa del formulario
│   ├── docker-compose.yml     ← Configuración Docker/N8N
│   └── render.yaml            ← Configuración para Render
│
├── 📁 CONFIGURACIÓN
│   ├── .env                   ← Variables locales (no subir)
│   ├── .env.example           ← Template de .env
│   ├── .gitignore             ← Qué no subir a Git
│   └── start.ps1              ← Script de inicio local
│
├── 📁 SCRIPTS INICIALES
│   └── init-data.sh           ← Inicialización de PostgreSQL
│
└── 📁 DOCUMENTACIÓN
    ├── README.md              ← 📖 Guía principal
    ├── QUICK_START.md         ← ⚡ Empezar en 5 min
    ├── ARQUITECTURA.md        ← 📊 Diagramas y flujos
    ├── CAMBIOS.md             ← 📋 Qué se arregló
    ├── CHANGELOG.md           ← 📝 Cambios por archivo
    ├── DEPLOYMENT_CHECKLIST.md ← ✅ Paso a paso Render
    ├── INDEX.md               ← 📚 Este archivo
    └── [...otros archivos]
```

---

## 🎓 FLUJO DE APRENDIZAJE RECOMENDADO

### Principiante (Total: 30 min)
```
1. QUICK_START.md (5 min) ────────► Ejecutar localmente
2. README.md → Endpoints (10 min) ─► Entender qué hace cada URL
3. Experimentar (15 min) ─────────► Jugar con formulario
```

### Intermedio (Total: 1 hora)
```
1. README.md completo (20 min) ────► Leer todo
2. ARQUITECTURA.md (20 min) ──────► Entender flujos
3. DEPLOYMENT_CHECKLIST.md (20 min) ► Preparar para Render
```

### Avanzado (Total: 2 horas)
```
1. server.js (30 min) ────────► Revisar código
2. CAMBIOS.md (30 min) ──────► Entender cambios técnicos
3. docker-compose.yml (20 min) ─► Entender N8N/PostgreSQL
4. render.yaml (10 min) ──────► Configuración final
5. Desplegar en Render (30 min) ─► Deploy + verificar
```

---

## 🔑 CONCEPTOS CLAVE

Si ves estos términos en la documentación, aquí está la explicación:

| Término | Definición | Documentación |
|---------|-----------|---------------|
| **Proxy** | Servidor que forwardea peticiones | [ARQUITECTURA.md](ARQUITECTURA.md) |
| **Webhook** | URL que recibe notificaciones de N8N | [README.md](README.md#webhooks) |
| **Tunnelmole** | Servicio que expone localhost públicamente | [README.md](README.md) |
| **Render** | Plataforma cloud donde desplogar | [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) |
| **TARGET_URL** | URL interna de N8N | [ARQUITECTURA.md](ARQUITECTURA.md) |
| **PUBLIC_URL** | URL pública del proxy | [ARQUITECTURA.md](ARQUITECTURA.md) |
| **CONFIG_TOKEN** | Token para proteger configuración | [README.md](README.md#seguridad) |

---

## 🚀 GUÍA DE REFERENCIA RÁPIDA

### URLs Importantes

**Local:**
- Proxy: http://localhost:3000
- Formulario: http://localhost:3000/form
- N8N: http://localhost:5678
- Config: http://localhost:3000/api/config

**Render (reemplaza `xxxx` con tu URL):**
- Proxy: https://n8n-proxy-xxxx.onrender.com
- Formulario: https://n8n-proxy-xxxx.onrender.com/form
- Config: https://n8n-proxy-xxxx.onrender.com/api/config

### Comandos Útiles

```bash
# Iniciar local
npm install && npm start

# Docker
docker compose up -d        # Iniciar
docker compose ps           # Estado
docker compose logs -f      # Ver logs
docker compose down         # Detener

# Git
git status                  # Ver cambios
git add .                   # Preparar
git commit -m "mensaje"     # Commit
git push                    # Enviar a Render

# Probar endpoints
curl http://localhost:3000
curl http://localhost:3000/api/config
curl -X POST http://localhost:3000/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"nombre": "Test"}'
```

---

## ❓ PREGUNTAS FRECUENTES

**¿Por qué algunos archivos deben ser editados antes de Render?**
→ Porque tienes URLs específicas tuyas que no puede adivinar. Ver [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)

**¿Dónde veo los logs?**
→ En terminal si ejecutas `npm start`, en Render en el Dashboard. Ver [README.md](README.md#debugging)

**¿Qué pasa si cambio WEBHOOK_PATH?**
→ El formulario forwardeará a ese path. Pero primero debe existir en N8N. Ver [ARQUITECTURA.md](ARQUITECTURA.md)

**¿Puedo cambiar el puerto 3000?**
→ Sí, con `PORT=3001 npm start`. Pero Render asigna puerto automáticamente. Ver [README.md](README.md#variables)

**¿Qué es CONFIG_TOKEN?**
→ Un token para proteger el endpoint `/api/config` POST. Debe ser fuerte. Ver [README.md](README.md#seguridad)

---

## 📞 NECESITAS AYUDA?

1. **Documento apropiado para tu situación:**
   - Empezar → [QUICK_START.md](QUICK_START.md)
   - Entender → [ARQUITECTURA.md](ARQUITECTURA.md)
   - Desplegar → [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
   - Depurar → [README.md](README.md#debugging)

2. **Busca en documentación:**
   - Usa Ctrl+F en cada documento
   - Busca tu error o palabra clave

3. **Verifica logs:**
   - Terminal: `npm start`
   - Docker: `docker compose logs`
   - Browser: F12 → Console

4. **Relee la arquitectura:**
   - [ARQUITECTURA.md](ARQUITECTURA.md) explica cómo todo encaja

---

## 📊 PESO DE CADA DOCUMENTO

| Documento | Importancia | Urgencia | Deberías Leer |
|-----------|-------------|----------|--------------|
| QUICK_START.md | 🔴 Crítica | 🔴 Ahora | ✅ SÍ |
| README.md | 🔴 Crítica | 🟡 Luego | ✅ SÍ |
| ARQUITECTURA.md | 🟡 Alta | 🟡 Luego | ✅ SÍ |
| DEPLOYMENT_CHECKLIST.md | 🟡 Alta | 🟡 Si vas a Render | ✅ SÍ (si despliegas) |
| CAMBIOS.md | 🟢 Media | 🟢 Después | 🟤 Opcional |
| CHANGELOG.md | 🟢 Media | 🟢 Después | 🟤 Opcional |
| INDEX.md | 🟢 Media | 🟢 Consultable | 🟤 Este archivo! |

---

## 🎯 OBJETIVO FINAL

Cuando hayas leído/ejecutado lo correcto:

✅ Sabes cómo funciona el sistema
✅ Lo tienes corriendo en local
✅ Puedes desplegarlo en Render
✅ Entienden qué cambió y por qué
✅ Puedes hacer cambios futuros

---

**🚀 ¡Empezar ahora!**

→ Ve a [QUICK_START.md](QUICK_START.md) para comenzar en 5 minutos.

---

Última actualización: Abril 2026
