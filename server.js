const express = require("express");
const app = express();

// ─── State ───────────────────────────────────────────────────────────────────
let TUNNEL_URL = process.env.TARGET_URL || "";
let TUNNEL_REGISTERED_AT = null;
let N8N_API_KEY = process.env.N8N_API_KEY || "";
const CONFIG_TOKEN = process.env.CONFIG_TOKEN || "mysecret";
const TEST_WEBHOOK_PATH = "test-form";
const FETCH_TIMEOUT_MS = 8000;

// ─── Helper: fetch con timeout ───────────────────────────────────────────────
function n8nFetch(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use("/api", express.json());

// ─── API: Register tunnel URL ────────────────────────────────────────────────
app.post("/api/tunnel", (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${CONFIG_TOKEN}`) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid token" });
  }
  const { tunnelUrl, n8nApiKey } = req.body;
  if (!tunnelUrl) return res.status(400).json({ error: "Missing tunnelUrl in body" });
  TUNNEL_URL = tunnelUrl.replace(/\/+$/, "");
  TUNNEL_REGISTERED_AT = new Date().toISOString();
  if (n8nApiKey) N8N_API_KEY = n8nApiKey;
  console.log(`[TUNNEL] Registered: ${TUNNEL_URL}`);
  res.json({ message: "Tunnel URL registered", tunnelUrl: TUNNEL_URL, registeredAt: TUNNEL_REGISTERED_AT });
});

// ─── API: Get status ─────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    tunnelUrl: TUNNEL_URL || null,
    tunnelActive: !!TUNNEL_URL,
    hasApiKey: !!N8N_API_KEY,
    registeredAt: TUNNEL_REGISTERED_AT,
    uptime: process.uptime(),
  });
});

// ─── API: Debug — llama directamente a n8n y muestra el resultado crudo ──────
app.get("/api/debug", async (req, res) => {
  const state = { tunnelUrl: TUNNEL_URL || null, tunnelActive: !!TUNNEL_URL, hasApiKey: !!N8N_API_KEY };
  if (!TUNNEL_URL || !N8N_API_KEY) return res.json({ state, error: "Tunnel or API key not configured" });
  try {
    const r = await n8nFetch(`${TUNNEL_URL}/api/v1/workflows?limit=5`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });
    let data;
    try { data = await r.json(); } catch { data = await r.text(); }
    res.json({ state, n8nStatus: r.status, n8nResponse: data });
  } catch (err) {
    res.json({ state, n8nError: err.name === "AbortError" ? `Timeout (>${FETCH_TIMEOUT_MS}ms)` : err.message });
  }
});

// ─── API: List webhooks from n8n ─────────────────────────────────────────────
app.get("/api/webhooks", async (req, res) => {
  if (!TUNNEL_URL) {
    return res.status(503).json({ error: "Tunnel not configured", message: "No hay tunel registrado. Ejecuta start.ps1 localmente." });
  }
  if (!N8N_API_KEY) {
    return res.status(400).json({ error: "N8N_API_KEY not configured", message: "Falta N8N_API_KEY. Añadelo al .env local y reinicia start.ps1." });
  }
  try {
    // Paso 1: lista de workflows activos (con timeout)
    const listRes = await n8nFetch(`${TUNNEL_URL}/api/v1/workflows?active=true&limit=50`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });
    if (!listRes.ok) {
      const text = await listRes.text();
      return res.status(listRes.status).json({ error: "n8n API error", message: text });
    }
    const listData = await listRes.json();
    const workflowList = listData.data || listData;
    const proxyBase = `${req.protocol}://${req.get("host")}`;
    const webhooks = [];

    // Paso 2: obtener nodes de cada workflow — máx 5 en paralelo
    const CONCURRENCY = 5;
    for (let i = 0; i < workflowList.length; i += CONCURRENCY) {
      const batch = workflowList.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (wfMeta) => {
        try {
          let wf = wfMeta;
          if (!wf.nodes) {
            const detailRes = await n8nFetch(`${TUNNEL_URL}/api/v1/workflows/${wfMeta.id}`, {
              headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
            });
            if (detailRes.ok) wf = await detailRes.json();
          }
          if (!wf.nodes) return;
          for (const node of wf.nodes) {
            if (node.type === "n8n-nodes-base.webhook" || node.type === "@n8n/n8n-nodes-langchain.webhook") {
              const path = node.parameters?.path || "";
              if (path) {
                webhooks.push({
                  workflowId: wf.id,
                  workflowName: wf.name,
                  workflowActive: wf.active,
                  nodeName: node.name,
                  path,
                  urlProxy: `${proxyBase}/webhook/${path}`,
                  urlProxyTest: `${proxyBase}/webhook-test/${path}`,
                });
              }
            }
          }
        } catch { /* workflow individual timeout o error, se salta */ }
      }));
    }
    res.json({ total: webhooks.length, tunnelUrl: TUNNEL_URL, webhooks });
  } catch (err) {
    const msg = err.name === "AbortError" ? `Timeout: n8n no respondio en ${FETCH_TIMEOUT_MS}ms` : err.message;
    res.status(502).json({ error: "Could not reach n8n through tunnel", message: msg });
  }
});

// ─── API: Create test workflow in n8n ────────────────────────────────────────
app.post("/api/setup-test-workflow", async (req, res) => {
  if (!TUNNEL_URL) return res.status(503).json({ error: "Tunnel not configured", message: "Ejecuta start.ps1 para conectar el tunel." });
  if (!N8N_API_KEY) return res.status(400).json({ error: "N8N_API_KEY not configured", message: "Falta N8N_API_KEY en .env." });

  const proxyBase = `${req.protocol}://${req.get("host")}`;

  try {
    const listRes = await fetch(`${TUNNEL_URL}/api/v1/workflows?limit=100`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });
    if (!listRes.ok) {
      const txt = await listRes.text();
      return res.status(listRes.status).json({ error: "n8n API error", message: txt });
    }
    const listData = await listRes.json();
    const workflows = listData.data || listData;
    const existing = workflows.find(wf => wf.name === "test");

    if (existing) {
      // Borrar el workflow existente antes de recrearlo
      console.log(`[SETUP] Deleting existing 'test' workflow id=${existing.id}`);
      const delRes = await fetch(`${TUNNEL_URL}/api/v1/workflows/${existing.id}`, {
        method: "DELETE",
        headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
      });
      if (!delRes.ok) {
        const txt = await delRes.text();
        return res.status(delRes.status).json({ error: "No se pudo borrar el workflow existente", message: txt });
      }
      console.log(`[SETUP] Deleted workflow id=${existing.id}, proceeding to recreate`);
    }

    // Crear el workflow con 3 nodos: Webhook → Set → Respond to Webhook
    const workflow = {
      name: "test",
      nodes: [
        {
          id: "a1b2c3d4-0001-0001-0001-000000000001",
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [240, 300],
          webhookId: TEST_WEBHOOK_PATH,
          parameters: {
            path: TEST_WEBHOOK_PATH,
            responseMode: "responseNode",
            options: {},
          },
        },
        {
          id: "a1b2c3d4-0002-0002-0002-000000000002",
          name: "Set",
          type: "n8n-nodes-base.set",
          typeVersion: 3.2,
          position: [460, 300],
          parameters: {
            mode: "manual",
            assignments: {
              assignments: [
                {
                  id: "a1b2c3d4-0003-0003-0003-000000000003",
                  name: "mensaje",
                  value: "={{ 'Hola ' + ($json.nombre || 'visitante') + '! Tu formulario fue recibido correctamente.' }}",
                  type: "string",
                },
                {
                  id: "a1b2c3d4-0004-0004-0004-000000000004",
                  name: "timestamp",
                  value: "={{ $now.toISO() }}",
                  type: "string",
                },
                {
                  id: "a1b2c3d4-0005-0005-0005-000000000005",
                  name: "status",
                  value: "ok",
                  type: "string",
                },
              ],
            },
            options: {},
          },
        },
        {
          id: "a1b2c3d4-0006-0006-0006-000000000006",
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1.1,
          position: [680, 300],
          parameters: {
            respondWith: "json",
            responseBody: "={{ $json }}",
            options: {},
          },
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "Set", type: "main", index: 0 }]] },
        Set: { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
    };

    const createRes = await fetch(`${TUNNEL_URL}/api/v1/workflows`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(workflow),
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      return res.status(createRes.status).json({ error: "Error creating workflow", details: createData });
    }
    const wfId = createData.id;
    await fetch(`${TUNNEL_URL}/api/v1/workflows/${wfId}/activate`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });
    const wasExisting = !!existing;
    res.json({
      created: true,
      message: wasExisting
        ? "Workflow 'test' eliminado y recreado correctamente"
        : "Workflow 'test' creado y activado correctamente",
      workflowId: wfId,
      webhookPath: TEST_WEBHOOK_PATH,
      webhookUrl: `${proxyBase}/webhook/${TEST_WEBHOOK_PATH}`,
      webhookTestUrl: `${proxyBase}/webhook-test/${TEST_WEBHOOK_PATH}`,
    });
  } catch (err) {
    res.status(500).json({ error: "Error interno", message: err.message });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", tunnelActive: !!TUNNEL_URL });
});

// ─── Webhook Proxy ───────────────────────────────────────────────────────────
app.all(["/webhook/*", "/webhook-test/*"], (req, res) => {
  if (!TUNNEL_URL) return res.status(503).json({ error: "Tunnel not configured" });
  const targetUrl = `${TUNNEL_URL}${req.originalUrl}`;
  console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${targetUrl}`);
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const rawBody = Buffer.concat(chunks);
      const forwardHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) {
        const lower = key.toLowerCase();
        if (["host", "connection", "content-length"].includes(lower)) continue;
        forwardHeaders[key] = value;
      }
      const fetchOptions = { method: req.method, headers: forwardHeaders };
      if (req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0) fetchOptions.body = rawBody;
      const response = await fetch(targetUrl, fetchOptions);
      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (!["transfer-encoding", "connection"].includes(name.toLowerCase())) res.setHeader(name, value);
      });
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(`[PROXY ERROR]`, err.message);
      if (!res.headersSent) res.status(502).json({ error: "Proxy error", message: err.message });
    }
  });
});

// ─── Dashboard page ──────────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => { res.type("text/html").send(DASHBOARD_HTML); });

// ─── Form page ───────────────────────────────────────────────────────────────
app.get("/form", (req, res) => { res.type("text/html").send(FORM_HTML); });

// ─── Root: Status page ───────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const statusColor = TUNNEL_URL ? "#22c55e" : "#ef4444";
  const statusEmoji = TUNNEL_URL ? "🟢" : "🔴";
  res.type("text/html").send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>n8n Proxy Status</title>
<style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#1e293b;padding:40px;border-radius:12px;width:400px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)}.status{color:${statusColor};font-weight:bold;margin:20px 0;font-size:1.2rem}.btn{display:block;padding:12px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;margin-top:10px;font-weight:bold}.btn:hover{background:#4f46e5}</style>
</head><body><div class="card">
<h1>${statusEmoji} n8n Proxy</h1>
<div class="status">${TUNNEL_URL ? "Activo" : "Desconectado"}</div>
<p style="color:#94a3b8;font-size:.9rem;margin-bottom:20px">${TUNNEL_URL || "Esperando conexion local..."}</p>
<a href="/dashboard" class="btn">📋 Dashboard</a>
<a href="/form" class="btn" style="background:#10b981">📝 Formulario</a>
<a href="/api/debug" class="btn" style="background:#475569">🔍 Debug API</a>
</div></body></html>`);
});

app.use((req, res) => { res.status(404).json({ error: "Not found" }); });

// ─── HTML: Dashboard ─────────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Dashboard — n8n Webhooks</title>
<style>
*{box-sizing:border-box}
body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:40px 20px}
.container{max-width:800px;margin:auto}
h1{margin-bottom:4px}
.subtitle{color:#94a3b8;font-size:.95rem;margin-top:0;margin-bottom:24px}
.card{background:#1e293b;padding:20px;border-radius:10px;margin-bottom:15px;border:1px solid #334155}
.btn{padding:6px 14px;background:#6366f1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.85rem}
.btn:hover{background:#4f46e5}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:bold;margin-left:8px}
.ok{background:#14532d;color:#4ade80}
.ko{background:#450a0a;color:#fca5a5}
.url{font-family:monospace;font-size:.8rem;color:#818cf8;display:block;margin:6px 0;word-break:break-all}
.error{color:#f87171;background:#3f1515;padding:15px;border-radius:8px;border:1px solid #7f1d1d}
</style></head>
<body><div class="container">
<h1>📋 Webhooks Activos</h1>
<p class="subtitle" id="tunnel-info">Cargando...</p>
<div id="list"><p style="color:#94a3b8">Cargando webhooks...</p></div>
</div>
<script>
async function load() {
  try {
    const s = await (await fetch('/api/status')).json();
    document.getElementById('tunnel-info').innerHTML = s.tunnelActive
      ? 'Tunel: <strong style="color:#4ade80">' + s.tunnelUrl + '</strong>'
      : '<span style="color:#f87171">Tunel desconectado — ejecuta start.ps1</span>';
    const r = await fetch('/api/webhooks');
    const d = await r.json();
    if (!r.ok) { document.getElementById('list').innerHTML = '<div class="error">' + (d.message || d.error || 'Error') + '</div>'; return; }
    let h = '';
    if (!d.webhooks || d.webhooks.length === 0) {
      h = '<p>No hay webhooks activos en n8n.</p>';
    } else {
      for (const w of d.webhooks) {
        const act = w.workflowActive ? '<span class="badge ok">Activo</span>' : '<span class="badge ko">Inactivo</span>';
        h += '<div class="card"><strong>' + w.workflowName + '</strong>' + act +
             '<br><small style="color:#94a3b8">Nodo: ' + w.nodeName + '</small>' +
             '<span class="url">' + w.urlProxy + '</span>' +
             '<button class="btn" onclick="navigator.clipboard.writeText(\'' + w.urlProxy + '\')">Copiar URL</button></div>';
      }
    }
    document.getElementById('list').innerHTML = h;
  } catch(e) {
    document.getElementById('list').innerHTML = '<div class="error">Error de red: ' + e.message + '</div>';
  }
}
load();
</script></body></html>`;

// ─── HTML: Form ──────────────────────────────────────────────────────────────
const FORM_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Test n8n — Formulario</title>
<style>
*{box-sizing:border-box}
body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:40px 20px}
.card{background:#1e293b;padding:24px;border-radius:12px;width:100%;max-width:480px;margin-bottom:20px;border:1px solid #334155}
h1{margin:0 0 4px;font-size:1.25rem}
.sub{margin:0 0 16px;font-size:.9rem;color:#94a3b8;font-weight:normal}
input{width:100%;padding:10px;margin:6px 0 14px;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:6px;font-size:1rem}
input:focus{outline:none;border-color:#6366f1}
.btn{width:100%;padding:12px;border:none;color:#fff;font-weight:bold;border-radius:8px;cursor:pointer;font-size:1rem;transition:background .2s}
.btn-green{background:#10b981}.btn-green:hover{background:#059669}
.btn-purple{background:#6366f1}.btn-purple:hover{background:#4f46e5}
.btn:disabled{opacity:.5;cursor:not-allowed}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot-ok{background:#22c55e}.dot-err{background:#ef4444}
pre{background:#0f172a;padding:14px;border-radius:8px;font-size:.85rem;white-space:pre-wrap;color:#22c55e;margin-top:12px;border:1px solid #1e3a2f}
.err-box{background:#3f1515;border:1px solid #7f1d1d;color:#f87171;padding:12px;border-radius:8px;margin-top:12px;font-size:.9rem}
.wh-url{font-family:monospace;font-size:.78rem;background:#0f172a;padding:6px 10px;border-radius:4px;display:block;margin-top:8px;color:#818cf8;word-break:break-all}
.setup-msg{margin-top:12px;font-size:.9rem}
</style></head>
<body>

<div class="card">
  <h1>⚡ Setup Workflow de Prueba</h1>
  <p class="sub">Crea el workflow "test" en n8n si no existe aun</p>
  <div id="tunnel-status">Verificando tunel...</div>
  <div id="setup-msg" class="setup-msg"></div>
  <button class="btn btn-purple" id="btn-setup" style="margin-top:16px" onclick="setupWorkflow()">
    Crear Workflow "test" en n8n
  </button>
</div>

<div class="card">
  <h1>📝 Formulario de Prueba</h1>
  <p class="sub" id="wh-label">Webhook: /webhook/test-form</p>
  <label style="color:#94a3b8;font-size:.85rem">Tu nombre</label>
  <input id="nom" type="text" placeholder="Escribe tu nombre" autocomplete="off">
  <button class="btn btn-green" id="btn-send" onclick="sendForm()">📤 Enviar a n8n</button>
  <div id="resp"></div>
</div>

<script>
// URL del webhook — se actualiza despues del setup
let currentWebhookUrl = '/webhook/test-form';

async function checkStatus() {
  try {
    const d = await (await fetch('/api/status')).json();
    const el = document.getElementById('tunnel-status');
    if (d.tunnelActive) {
      el.innerHTML = '<span class="dot dot-ok"></span>Tunel activo: <small style="color:#818cf8">' + d.tunnelUrl + '</small>';
    } else {
      el.innerHTML = '<span class="dot dot-err"></span><span style="color:#f87171">Tunel desconectado — ejecuta start.ps1</span>';
    }
  } catch(e) {
    document.getElementById('tunnel-status').textContent = 'Error al verificar estado';
  }
}

async function setupWorkflow() {
  const btn = document.getElementById('btn-setup');
  const msg = document.getElementById('setup-msg');
  btn.disabled = true;
  btn.textContent = 'Creando...';
  msg.innerHTML = '';
  try {
    const r = await fetch('/api/setup-test-workflow', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      // Actualizar la URL del webhook con la real devuelta por el servidor
      currentWebhookUrl = d.webhookUrl || currentWebhookUrl;
      document.getElementById('wh-label').textContent = 'Webhook: ' + currentWebhookUrl;
      msg.innerHTML = '<span style="color:#4ade80">✅ ' + d.message + '</span><span class="wh-url">' + d.webhookUrl + '</span>';
      btn.textContent = d.created ? '✅ Workflow Creado' : '✅ Ya Existia';
    } else {
      msg.innerHTML = '<div class="err-box">❌ ' + (d.message || d.error || 'Error desconocido') + '</div>';
      btn.disabled = false;
      btn.textContent = '🔁 Reintentar';
    }
  } catch(e) {
    msg.innerHTML = '<div class="err-box">❌ Error de red: ' + e.message + '</div>';
    btn.disabled = false;
    btn.textContent = '🔁 Reintentar';
  }
}

async function sendForm() {
  const btn = document.getElementById('btn-send');
  const rDiv = document.getElementById('resp');
  const nombre = document.getElementById('nom').value.trim();
  if (!nombre) { document.getElementById('nom').focus(); return; }
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  rDiv.innerHTML = '';
  try {
    const r = await fetch(currentWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombre }),
    });
    // Manejar tanto respuestas JSON como HTML (n8n puede devolver HTML si el webhook no existe)
    const contentType = r.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const d = await r.json();
      rDiv.innerHTML = '<pre>' + JSON.stringify(d, null, 2) + '</pre>';
    } else {
      const text = await r.text();
      if (r.ok) {
        rDiv.innerHTML = '<pre>' + text.substring(0, 1000) + '</pre>';
      } else {
        rDiv.innerHTML = '<div class="err-box">HTTP ' + r.status + ' — n8n devolvio HTML en vez de JSON.<br>' +
                         'Pulsa "Crear Workflow" arriba para asegurarte de que el workflow existe y esta activo.<br><br>' +
                         '<small>' + text.substring(0, 300) + '</small></div>';
      }
    }
  } catch(e) {
    rDiv.innerHTML = '<div class="err-box">❌ Error de red: ' + e.message + '</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Enviar a n8n';
  }
}

checkStatus();
</script>
</body></html>`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { console.log(`Server on port ${PORT}`); });