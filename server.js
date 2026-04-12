const express = require("express");
const app = express();

// ─── State ───────────────────────────────────────────────────────────────────
let TUNNEL_URL = process.env.TARGET_URL || "";
let TUNNEL_REGISTERED_AT = null;
let N8N_API_KEY = process.env.N8N_API_KEY || "";
const CONFIG_TOKEN = process.env.CONFIG_TOKEN || "mysecret";
const TEST_WEBHOOK_PATH = "test-form";

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use("/api", express.json());

// ─── API: Register tunnel URL ────────────────────────────────────────────────
app.post("/api/tunnel", (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${CONFIG_TOKEN}`) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid token" });
  }

  const { tunnelUrl, n8nApiKey } = req.body;
  if (!tunnelUrl) {
    return res.status(400).json({ error: "Missing tunnelUrl in body" });
  }

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
  if (!TUNNEL_URL || !N8N_API_KEY) {
    return res.json({ state, error: "Tunnel or API key not configured" });
  }
  try {
    const r = await fetch(`${TUNNEL_URL}/api/v1/workflows?limit=5`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });
    let data;
    try { data = await r.json(); } catch { data = await r.text(); }
    res.json({ state, n8nStatus: r.status, n8nResponse: data });
  } catch (err) {
    res.json({ state, n8nError: err.message });
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
    // Paso 1: lista de workflows (el endpoint de lista NO incluye nodes en n8n)
    const listRes = await fetch(`${TUNNEL_URL}/api/v1/workflows?active=true&limit=50`, {
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

    // Paso 2: obtener detalles completos de cada workflow para leer sus nodes
    await Promise.all(workflowList.map(async (wfMeta) => {
      try {
        let wf = wfMeta;
        if (!wf.nodes) {
          const detailRes = await fetch(`${TUNNEL_URL}/api/v1/workflows/${wfMeta.id}`, {
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
      } catch { /* workflow individual inaccesible, se salta */ }
    }));

    res.json({ total: webhooks.length, tunnelUrl: TUNNEL_URL, webhooks });
  } catch (err) {
    res.status(502).json({ error: "Could not reach n8n through tunnel", message: err.message });
  }
});

// ─── API: Create test workflow in n8n ────────────────────────────────────────
app.post("/api/setup-test-workflow", async (req, res) => {
  if (!TUNNEL_URL) return res.status(503).json({ error: "Tunnel not configured", message: "Ejecuta start.ps1 para conectar el tunel." });
  if (!N8N_API_KEY) return res.status(400).json({ error: "N8N_API_KEY not configured", message: "Falta N8N_API_KEY en .env." });

  const proxyBase = `${req.protocol}://${req.get("host")}`;

  try {
    // Verificar si ya existe workflow llamado "test"
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
      return res.json({
        created: false,
        message: "El workflow 'test' ya existe",
        workflowId: existing.id,
        webhookUrl: `${proxyBase}/webhook/${TEST_WEBHOOK_PATH}`,
        webhookTestUrl: `${proxyBase}/webhook-test/${TEST_WEBHOOK_PATH}`,
      });
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

    // Activar el workflow
    const wfId = createData.id;
    await fetch(`${TUNNEL_URL}/api/v1/workflows/${wfId}/activate`, {
      method: "POST",
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });

    res.json({
      created: true,
      message: "Workflow 'test' creado y activado correctamente",
      workflowId: wfId,
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
  if (!TUNNEL_URL) {
    return res.status(503).json({ error: "Tunnel not configured" });
  }

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
      if (req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0) {
        fetchOptions.body = rawBody;
      }
      const response = await fetch(targetUrl, fetchOptions);
      res.status(response.status);
      response.headers.forEach((value, name) => {
        if (!["transfer-encoding", "connection"].includes(name.toLowerCase())) {
          res.setHeader(name, value);
        }
      });
      const responseBuffer = Buffer.from(await response.arrayBuffer());
      res.send(responseBuffer);
    } catch (err) {
      console.error(`[PROXY ERROR]`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Proxy error", message: err.message });
      }
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
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>n8n Proxy Status</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin:0; }
    .card { background: #1e293b; padding: 40px; border-radius: 12px; width: 400px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .status { color: ${statusColor}; font-weight: bold; margin: 20px 0; font-size: 1.2rem; }
    .btn { display: block; padding: 12px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; margin-top: 10px; font-weight: bold; }
    .btn:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${statusEmoji} n8n Proxy</h1>
    <div class="status">${TUNNEL_URL ? "Activo" : "Desconectado"}</div>
    <p style="color:#94a3b8; font-size: 0.9rem; margin-bottom: 20px;">${TUNNEL_URL || "Esperando conexion local..."}</p>
    <a href="/dashboard" class="btn">📋 Dashboard</a>
    <a href="/form" class="btn" style="background:#10b981">📝 Formulario</a>
    <a href="/api/debug" class="btn" style="background:#475569">🔍 Debug API</a>
  </div>
</body>
</html>`);
});

app.use((req, res) => { res.status(404).json({ error: "Not found" }); });

// ─── HTML Content ────────────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html><html><head><title>Dashboard — n8n Webhooks</title><style>*{box-sizing:border-box}body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:40px 20px}.container{max-width:800px;margin:auto}h1{margin-bottom:4px}h2{color:#94a3b8;font-size:0.95rem;font-weight:normal;margin-top:0}.card{background:#1e293b;padding:20px;border-radius:10px;margin-bottom:15px;border:1px solid #334155}.btn{padding:6px 12px;background:#6366f1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem}.btn:hover{background:#4f46e5}.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:bold;margin-left:8px}.badge-ok{background:#14532d;color:#4ade80}.badge-ko{background:#450a0a;color:#fca5a5}.url{font-family:monospace;font-size:0.8rem;color:#818cf8;display:block;margin:6px 0;word-break:break-all}.error{color:#f87171;background:#3f1515;padding:15px;border-radius:8px;border:1px solid #7f1d1d}.spinner{color:#94a3b8}</style></head><body><div class="container"><h1>📋 Webhooks Activos</h1><h2 id="tunnel-info">Cargando estado del tunel...</h2><div id="list"><p class="spinner">Cargando webhooks...</p></div></div><script>async function load(){try{const s=await fetch("/api/status");const sd=await s.json();document.getElementById("tunnel-info").innerHTML=sd.tunnelActive?"Tunel: <strong style=\\"color:#4ade80\\">"+sd.tunnelUrl+"</strong>":"<span style=\\"color:#f87171\\">Tunel desconectado — ejecuta start.ps1</span>";const r=await fetch("/api/webhooks");const d=await r.json();if(!r.ok){document.getElementById("list").innerHTML="<div class=\\"error\\">"+( d.message||d.error||"Error")+"</div>";return}let h="";if(!d.webhooks||d.webhooks.length===0){h="<p>No hay webhooks activos en n8n. Activa algun workflow con un nodo Webhook.</p>"}else{for(const w of d.webhooks){const act=w.workflowActive?"<span class=\\"badge badge-ok\\">Activo</span>":"<span class=\\"badge badge-ko\\">Inactivo</span>";h+="<div class=\\"card\\"><strong>"+w.workflowName+"</strong>"+act+"<br><small style=\\"color:#94a3b8\\">Nodo: "+w.nodeName+"</small><span class=\\"url\\">"+w.urlProxy+"</span><button class=\\"btn\\" onclick=\\"navigator.clipboard.writeText('"+w.urlProxy+"')\\">Copiar URL</button></div>"}}document.getElementById("list").innerHTML=h}catch(e){document.getElementById("list").innerHTML="<div class=\\"error\\">Error de red: "+e.message+"</div>"}}load()</script></body></html>`;

const FORM_HTML = `<!DOCTYPE html><html><head><title>Test n8n — Formulario</title><style>*{box-sizing:border-box}body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:40px 20px}.card{background:#1e293b;padding:24px;border-radius:12px;width:100%;max-width:480px;margin-bottom:20px;border:1px solid #334155}h1{margin:0 0 6px;font-size:1.3rem}h2{margin:0 0 16px;font-size:0.9rem;color:#94a3b8;font-weight:normal}input{width:100%;padding:10px;margin:6px 0 14px;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:6px;font-size:1rem}input:focus{outline:none;border-color:#6366f1}.btn{width:100%;padding:12px;border:none;color:#fff;font-weight:bold;border-radius:8px;cursor:pointer;font-size:1rem;transition:background 0.2s}.btn-green{background:#10b981}.btn-green:hover{background:#059669}.btn-purple{background:#6366f1}.btn-purple:hover{background:#4f46e5}.btn:disabled{opacity:0.5;cursor:not-allowed}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.dot-ok{background:#22c55e}.dot-err{background:#ef4444}pre{background:#0f172a;padding:14px;border-radius:8px;font-size:0.85rem;white-space:pre-wrap;color:#22c55e;margin-top:12px;border:1px solid #1e3a2f}.err-box{background:#3f1515;border:1px solid #7f1d1d;color:#f87171;padding:12px;border-radius:8px;margin-top:12px}.setup-result{margin-top:12px;font-size:0.9rem}.wh-url{font-family:monospace;font-size:0.78rem;background:#0f172a;padding:6px 10px;border-radius:4px;display:block;margin-top:8px;color:#818cf8;word-break:break-all}</style></head><body><div class="card"><h1>⚡ Setup Workflow de Prueba</h1><h2>Crea el workflow "test" en n8n si no existe aun</h2><div id="tunnel-status">Verificando tunel...</div><div id="setup-result" class="setup-result"></div><button class="btn btn-purple" id="btn-setup" onclick="setupWorkflow()" style="margin-top:16px">Crear Workflow "test" en n8n</button></div><div class="card"><h1>📝 Formulario de Prueba</h1><h2>Envia datos al webhook de n8n a traves del proxy</h2><label style="color:#94a3b8;font-size:0.85rem">Tu nombre</label><input id="nom" type="text" placeholder="Escribe tu nombre" required autocomplete="off"><button class="btn btn-green" id="btn-send" onclick="sendForm()">📤 Enviar a n8n</button><div id="resp"></div></div><script>const WH_PATH="test-form";async function checkStatus(){try{const r=await fetch("/api/status");const d=await r.json();const el=document.getElementById("tunnel-status");if(d.tunnelActive){el.innerHTML="<span class=\\"dot dot-ok\\"></span>Tunel activo: <small style=\\"color:#818cf8\\">"+d.tunnelUrl+"</small>"}else{el.innerHTML="<span class=\\"dot dot-err\\"></span><span style=\\"color:#f87171\\">Tunel desconectado — ejecuta start.ps1</span>"}}catch(e){document.getElementById("tunnel-status").textContent="Error al verificar estado"}}async function setupWorkflow(){const btn=document.getElementById("btn-setup");const res=document.getElementById("setup-result");btn.disabled=true;btn.textContent="Creando...";res.innerHTML="";try{const r=await fetch("/api/setup-test-workflow",{method:"POST"});const d=await r.json();if(r.ok){res.innerHTML="<span style=\\"color:#4ade80\\">ok  "+d.message+"</span><span class=\\"wh-url\\">"+d.webhookUrl+"</span>";btn.textContent=d.created?"ok  Workflow Creado":"ok  Ya Existia"}else{res.innerHTML="<div class=\\"err-box\\">"+( d.message||d.error||"Error desconocido")+"</div>";btn.disabled=false;btn.textContent="Reintentar"}}catch(e){res.innerHTML="<div class=\\"err-box\\">Error de red: "+e.message+"</div>";btn.disabled=false;btn.textContent="Reintentar"}}async function sendForm(){const btn=document.getElementById("btn-send");const rDiv=document.getElementById("resp");const nombre=document.getElementById("nom").value.trim();if(!nombre)return;btn.disabled=true;btn.textContent="Enviando...";rDiv.innerHTML="";try{const r=await fetch("/webhook/"+WH_PATH,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre:nombre})});const d=await r.json();rDiv.innerHTML="<pre>"+JSON.stringify(d,null,2)+"</pre>"}catch(e){rDiv.innerHTML="<div class=\\"err-box\\">Error: "+e.message+"</div>"}finally{btn.disabled=false;btn.textContent="📤 Enviar a n8n"}}checkStatus()</script></body></html>`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { console.log(`Server on port ${PORT}`); });