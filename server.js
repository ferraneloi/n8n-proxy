const express = require("express");
const app = express();

// ─── State ───────────────────────────────────────────────────────────────────
let TUNNEL_URL = process.env.TARGET_URL || "";
let TUNNEL_REGISTERED_AT = null;
let N8N_API_KEY = process.env.N8N_API_KEY || "";
const CONFIG_TOKEN = process.env.CONFIG_TOKEN || "mysecret";

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
  if (n8nApiKey) {
    N8N_API_KEY = n8nApiKey;
  }
  console.log(`[TUNNEL] Registered: ${TUNNEL_URL}`);

  res.json({
    message: "Tunnel URL registered",
    tunnelUrl: TUNNEL_URL,
    registeredAt: TUNNEL_REGISTERED_AT,
  });
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

// ─── API: List webhooks from n8n ─────────────────────────────────────────────
app.get("/api/webhooks", async (req, res) => {
  if (!TUNNEL_URL) {
    return res.status(503).json({ error: "Tunnel not configured", message: "No hay túnel registrado. Ejecuta start.ps1 localmente." });
  }
  if (!N8N_API_KEY) {
    return res.status(400).json({
      error: "N8N_API_KEY not configured",
      message: "Falta N8N_API_KEY. Añádelo al .env local y reinicia start.ps1.",
    });
  }

  try {
    // Paso 1: obtener lista de workflows activos (el endpoint de lista NO incluye nodes)
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

    // Paso 2: para cada workflow, obtener detalles completos (con nodes) si no vienen en la lista
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

// ─── Root: Status page ──────────────────────────────────────────────────────
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
    <p style="color:#94a3b8; font-size: 0.9rem; margin-bottom: 20px;">${TUNNEL_URL || "Esperando conexión local..."}</p>
    <a href="/dashboard" class="btn">📋 Dashboard</a>
    <a href="/form" class="btn" style="background:#10b981">📝 Formulario</a>
  </div>
</body>
</html>`);
});

app.use((req, res) => { res.status(404).json({ error: "Not found" }); });

// ─── HTML Content ────────────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html><html><head><title>Dashboard</title><style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:40px}.container{max-width:800px;margin:auto}.card{background:#1e293b;padding:20px;border-radius:10px;margin-bottom:15px;border:1px solid #334155}.btn{padding:5px 10px;background:#6366f1;color:#fff;border:none;border-radius:4px;cursor:pointer}.error{color:#f87171;background:#3f1515;padding:15px;border-radius:8px;border:1px solid #7f1d1d}</style></head><body><div class="container"><h1>Webhooks Activos</h1><div id="list">Cargando...</div></div><script>async function load(){try{const r=await fetch('/api/webhooks');const d=await r.json();if(!r.ok){document.getElementById('list').innerHTML='<div class=\'error\'>'+( d.message||d.error||'Error desconocido')+'</div>';return}let h='';if(d.webhooks.length===0){h='<p>No hay webhooks activos en n8n.</p>'}else{for(const w of d.webhooks){h+='<div class=\'card\'><strong>'+w.workflowName+'</strong><br><small>'+w.urlProxy+'</small><br><button class=\'btn\' onclick=\'navigator.clipboard.writeText("'+w.urlProxy+'")\'>'+'Copiar</button></div>'}}document.getElementById('list').innerHTML=h}catch(e){document.getElementById('list').innerHTML='<div class=\'error\'>Error de red: '+e.message+'</div>'}};load()<\/script></body></html>`;

const FORM_HTML = `<!DOCTYPE html><html><head><title>Formulario</title><style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}form{background:#1e293b;padding:30px;border-radius:12px;width:350px}input{width:100%;padding:10px;margin:10px 0;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:6px}button{width:100%;padding:10px;background:#10b981;border:none;color:#fff;font-weight:bold;border-radius:6px;cursor:pointer}</style></head><body><form id="f"><h1>Test n8n</h1><input id="n" placeholder="Tu nombre" required><button type="submit" id="b">Enviar</button><pre id="r" style="margin-top:20px;color:#10b981;white-space:pre-wrap"></pre></form><script>document.getElementById('f').onsubmit=async(e)=>{e.preventDefault();const b=document.getElementById('b');b.disabled=true;try{const wr=await fetch('/api/webhooks');const wd=await wr.json();const path=wd.webhooks?.[0]?.path||'b273007d-e02a-416b-ad36-823d17458c07';const r=await fetch('/webhook/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:document.getElementById('n').value})});const d=await r.json();document.getElementById('r').textContent=JSON.stringify(d,null,2)}catch(err){document.getElementById('r').textContent='Error: '+err.message}finally{b.disabled=false}}<\/script></body></html>`;

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { console.log(`Server on port ${PORT}`); });