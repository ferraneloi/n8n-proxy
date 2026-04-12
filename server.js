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
    return res.status(503).json({ error: "Tunnel not configured" });
  }
  if (!N8N_API_KEY) {
    return res.status(503).json({
      error: "N8N_API_KEY not configured",
      message: "Add N8N_API_KEY to your .env file. Create one in n8n: Settings → API → Add API Key",
    });
  }

  try {
    const response = await fetch(`${TUNNEL_URL}/api/v1/workflows`, {
      headers: { "X-N8N-API-KEY": N8N_API_KEY, "Accept": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[API] n8n API error: ${response.status} ${text}`);
      return res.status(response.status).json({
        error: "n8n API error",
        status: response.status,
        message: response.status === 401 ? "Invalid API key. Check N8N_API_KEY." : text,
      });
    }

    const data = await response.json();
    const workflows = data.data || data;

    // Extract webhooks from all workflows
    const proxyBase = `${req.protocol}://${req.get("host")}`;
    const webhooks = [];

    for (const wf of workflows) {
      if (!wf.nodes) continue;

      for (const node of wf.nodes) {
        if (node.type === "n8n-nodes-base.webhook" || node.type === "@n8n/n8n-nodes-langchain.webhook") {
          const path = node.parameters?.path || "";
          const method = node.parameters?.httpMethod || "POST";
          if (path) {
            webhooks.push({
              workflowId: wf.id,
              workflowName: wf.name,
              workflowActive: wf.active,
              nodeName: node.name,
              method: method,
              path: path,
              urlProxy: `${proxyBase}/webhook/${path}`,
              urlProxyTest: `${proxyBase}/webhook-test/${path}`,
              urlDirect: `${TUNNEL_URL}/webhook/${path}`,
              urlDirectTest: `${TUNNEL_URL}/webhook-test/${path}`,
            });
          }
        }
      }
    }

    res.json({
      total: webhooks.length,
      proxyBase,
      tunnelUrl: TUNNEL_URL,
      webhooks,
    });
  } catch (err) {
    console.error("[API] Error fetching webhooks:", err.message);
    res.status(502).json({ error: "Could not reach n8n through tunnel", message: err.message });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    tunnelActive: !!TUNNEL_URL,
    timestamp: new Date().toISOString(),
  });
});

// ─── Webhook Proxy ───────────────────────────────────────────────────────────
app.all(["/webhook/*", "/webhook-test/*"], (req, res) => {
  if (!TUNNEL_URL) {
    return res.status(503).json({
      error: "Tunnel not configured",
      message: "No tunnel URL registered. Run start.ps1 on your local machine to start the tunnel.",
    });
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
        if (lower === "host" || lower === "connection" || lower === "content-length") continue;
        forwardHeaders[key] = value;
      }

      const fetchOptions = {
        method: req.method,
        headers: forwardHeaders,
      };

      if (req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0) {
        fetchOptions.body = rawBody;
      }

      const response = await fetch(targetUrl, fetchOptions);

      res.status(response.status);
      response.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (lower === "transfer-encoding" || lower === "connection") return;
        res.setHeader(name, value);
      });

      const responseBuffer = Buffer.from(await response.arrayBuffer());
      res.send(responseBuffer);
      console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${response.status}`);
    } catch (err) {
      console.error(`[PROXY ERROR] ${req.method} ${req.originalUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: "Proxy error", message: `Could not reach tunnel: ${err.message}` });
      }
    }
  });

  req.on("error", (err) => {
    console.error("[PROXY REQUEST ERROR]", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Request error", message: err.message });
    }
  });
});

// ─── Dashboard page ──────────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => {
  res.type("text/html").send(DASHBOARD_HTML);
});

// ─── Root: Status page ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  const statusColor = TUNNEL_URL ? "#22c55e" : "#ef4444";
  const statusText = TUNNEL_URL ? "Tunnel Active" : "Tunnel Not Connected";
  const statusEmoji = TUNNEL_URL ? "🟢" : "🔴";

  res.type("text/html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n Webhook Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; max-width: 520px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
    h1 { font-size: 1.5rem; margin-bottom: 24px; color: #f8fafc; }
    .status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; background: ${TUNNEL_URL ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"}; border: 1px solid ${statusColor}33; margin-bottom: 20px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; }
    .status-text { color: ${statusColor}; font-weight: 600; }
    .info dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px; margin-top: 12px; }
    .info dd { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.875rem; color: #cbd5e1; word-break: break-all; }
    .endpoints { list-style: none; margin-top: 16px; }
    .endpoints li { padding: 8px 0; border-bottom: 1px solid #334155; font-size: 0.875rem; }
    .endpoints li:last-child { border: none; }
    code { background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .method { color: #60a5fa; font-weight: 600; }
    .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: transform 0.15s, box-shadow 0.15s; }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.4); }
    footer { margin-top: 20px; font-size: 0.75rem; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${statusEmoji} n8n Webhook Proxy</h1>
    <div class="status">
      <div class="dot"></div>
      <span class="status-text">${statusText}</span>
    </div>
    <dl class="info">
      <dt>Tunnel URL</dt>
      <dd>${TUNNEL_URL || "Not registered — run start.ps1 locally"}</dd>
      ${TUNNEL_REGISTERED_AT ? `<dt>Registered</dt><dd>${TUNNEL_REGISTERED_AT}</dd>` : ""}
    </dl>
    <a class="btn" href="/dashboard">📋 Ver Webhooks Publicados</a>
    <a class="btn" style="background: linear-gradient(135deg, #10b981, #059669);" href="/form">📝 Formulario de Prueba</a>
    <h3 style="font-size: 0.875rem; color: #94a3b8; margin-bottom: 8px; margin-top: 20px;">Endpoints</h3>
    <ul class="endpoints">
      <li><span class="method">ANY</span> <code>/webhook/*</code> → proxy to n8n</li>
      <li><span class="method">ANY</span> <code>/webhook-test/*</code> → proxy to n8n</li>
      <li><span class="method">GET</span> <code>/form</code> → test form</li>
      <li><span class="method">GET</span> <code>/dashboard</code> → webhook list</li>
      <li><span class="method">GET</span> <code>/api/webhooks</code> → webhook list JSON</li>
      <li><span class="method">POST</span> <code>/api/tunnel</code> → register tunnel</li>
      <li><span class="method">GET</span> <code>/api/status</code> → status</li>
    </ul>
    <footer>n8n Webhook Proxy &middot; Powered by Render</footer>
  </div>
</body>
</html>`);
});

// ─── Form Page ───────────────────────────────────────────────────────────────
app.get("/form", (req, res) => {
  res.type("text/html").send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n Test Form</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #1e293b; border-radius: 12px; padding: 32px; max-width: 450px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); border: 1px solid #334155; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; color: #f8fafc; text-align: center; }
    p.subtitle { color: #94a3b8; font-size: 0.9rem; text-align: center; margin-bottom: 24px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-size: 0.8rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; font-weight: 600; }
    input { width: 100%; padding: 12px; border-radius: 8px; background: #0f172a; border: 1px solid #334155; color: #fff; font-size: 1rem; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #6366f1; }
    button { width: 100%; padding: 12px; border-radius: 8px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; border: none; font-size: 1rem; font-weight: 600; cursor: pointer; transition: transform 0.1s; }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .result { margin-top: 24px; padding: 16px; border-radius: 8px; background: #0f172a; border: 1px solid #334155; display: none; }
    .result.show { display: block; }
    .result-title { font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; }
    .result-content { font-family: monospace; font-size: 0.9rem; color: #10b981; white-space: pre-wrap; word-break: break-all; }
    .error { color: #ef4444; }
    .nav { margin-top: 24px; text-align: center; }
    .nav a { color: #6366f1; text-decoration: none; font-size: 0.85rem; }
    .nav a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📝 n8n Test Form</h1>
    <p class="subtitle">Envía datos a tu workflow de n8n</p>
    
    <form id="testForm">
      <div class="form-group">
        <label>Nombre</label>
        <input type="text" id="nombre" placeholder="Escribe tu nombre..." required>
      </div>
      <button type="submit" id="submitBtn">Enviar a n8n</button>
    </form>

    <div id="resultBox" class="result">
      <p class="result-title">Respuesta de n8n:</p>
      <div id="resultContent" class="result-content"></div>
    </div>

    <div class="nav">
      <a href="/dashboard">📋 Ver otros webhooks</a> &middot; <a href="/">🏠 Inicio</a>
    </div>
  </div>

  <script>
    const form = document.getElementById('testForm');
    const btn = document.getElementById('submitBtn');
    const resultBox = document.getElementById('resultBox');
    const resultContent = document.getElementById('resultContent');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nombre').value;
      
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      resultBox.classList.remove('show');
      
      try {
        // Intentamos obtener el primer webhook activo automáticamente
        const webhooksRes = await fetch('/api/webhooks');
        const webhooksData = await webhooksRes.json();
        
        let webhookPath = "b273007d-e02a-416b-ad36-823d17458c07"; // fallback
        if (webhooksData.webhooks && webhooksData.webhooks.length > 0) {
          const active = webhooksData.webhooks.find(w => w.workflowActive);
          if (active) webhookPath = active.path;
        }

        const response = await fetch('/webhook/' + webhookPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre })
        });

        const data = await response.json();
        resultContent.classList.remove('error');
        resultContent.textContent = JSON.stringify(data, null, 2);
        resultBox.classList.add('show');
      } catch (err) {
        resultContent.classList.add('error');
        resultContent.textContent = 'Error: ' + err.message;
        resultBox.classList.add('show');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar a n8n';
      }
    };
  </script>
</body>
</html>`);
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// ─── Dashboard HTML ──────────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>n8n Webhooks — Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }

    /* Header */
    .header { margin-bottom: 32px; }
    .header h1 { font-size: 1.75rem; font-weight: 700; color: #f8fafc; margin-bottom: 8px; }
    .header p { color: #94a3b8; font-size: 0.9rem; }
    .header a { color: #818cf8; text-decoration: none; }
    .header a:hover { text-decoration: underline; }

    /* Status bar */
    .status-bar {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 20px; border-radius: 10px;
      background: #1e293b; border: 1px solid #334155;
      margin-bottom: 24px; flex-wrap: wrap;
    }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.active { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
    .status-dot.inactive { background: #ef4444; }
    .status-label { font-weight: 600; font-size: 0.875rem; }
    .status-label.active { color: #22c55e; }
    .status-label.inactive { color: #ef4444; }
    .status-url { font-family: 'SF Mono', Consolas, monospace; font-size: 0.8rem; color: #94a3b8; margin-left: auto; }
    .btn-refresh {
      background: #334155; border: 1px solid #475569; color: #e2e8f0;
      padding: 6px 14px; border-radius: 6px; cursor: pointer;
      font-size: 0.8rem; font-weight: 500; transition: all 0.15s;
    }
    .btn-refresh:hover { background: #475569; }

    /* Loading */
    .loading { text-align: center; padding: 60px; color: #94a3b8; }
    .spinner { display: inline-block; width: 32px; height: 32px; border: 3px solid #334155;
      border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Error */
    .error-box {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3);
      border-radius: 10px; padding: 20px; color: #fca5a5; margin-bottom: 20px;
    }
    .error-box strong { color: #f87171; }

    /* Webhook cards */
    .webhook-list { display: flex; flex-direction: column; gap: 12px; }
    .webhook-card {
      background: #1e293b; border: 1px solid #334155; border-radius: 10px;
      padding: 20px; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .webhook-card:hover { border-color: #6366f1; box-shadow: 0 0 0 1px rgba(99,102,241,0.2); }
    .webhook-card.inactive { opacity: 0.5; }
    .wh-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .wh-workflow { font-weight: 600; font-size: 0.95rem; color: #f8fafc; }
    .wh-node { font-size: 0.8rem; color: #94a3b8; }
    .wh-badge {
      font-size: 0.7rem; font-weight: 600; padding: 3px 8px; border-radius: 4px;
      text-transform: uppercase; letter-spacing: 0.03em;
    }
    .wh-badge.active { background: rgba(34,197,94,0.15); color: #22c55e; }
    .wh-badge.inactive { background: rgba(239,68,68,0.15); color: #ef4444; }
    .wh-method {
      font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 4px;
      background: rgba(96,165,250,0.15); color: #60a5fa;
    }

    /* URL rows */
    .url-row {
      display: flex; align-items: center; gap: 8px;
      background: #0f172a; border-radius: 6px; padding: 8px 12px; margin-top: 8px;
    }
    .url-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 600; min-width: 50px; }
    .url-value {
      flex: 1; font-family: 'SF Mono', Consolas, monospace; font-size: 0.8rem;
      color: #cbd5e1; word-break: break-all; cursor: pointer;
    }
    .url-value:hover { color: #818cf8; }
    .btn-copy {
      background: #334155; border: 1px solid #475569; color: #e2e8f0;
      padding: 4px 10px; border-radius: 4px; cursor: pointer;
      font-size: 0.75rem; font-weight: 500; transition: all 0.15s; white-space: nowrap;
    }
    .btn-copy:hover { background: #6366f1; border-color: #6366f1; }
    .btn-copy.copied { background: #22c55e; border-color: #22c55e; }

    /* Empty state */
    .empty { text-align: center; padding: 60px 20px; color: #94a3b8; }
    .empty h3 { color: #e2e8f0; margin-bottom: 12px; }

    /* Summary */
    .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .summary-card {
      background: #1e293b; border: 1px solid #334155; border-radius: 8px;
      padding: 14px 20px; flex: 1; min-width: 120px;
    }
    .summary-card .num { font-size: 1.5rem; font-weight: 700; color: #f8fafc; }
    .summary-card .label { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }

    /* Toast */
    .toast {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px);
      background: #22c55e; color: #fff; padding: 10px 20px; border-radius: 8px;
      font-size: 0.85rem; font-weight: 600; opacity: 0; transition: all 0.3s;
      pointer-events: none; z-index: 100;
    }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Webhooks Publicados</h1>
      <p>Lista de webhooks de n8n accesibles desde internet &middot; <a href="/">← Volver</a></p>
    </div>

    <div id="status-bar" class="status-bar">
      <div class="status-dot inactive" id="statusDot"></div>
      <span class="status-label inactive" id="statusLabel">Cargando...</span>
      <span class="status-url" id="statusUrl"></span>
      <button class="btn-refresh" onclick="loadWebhooks()">↻ Refrescar</button>
    </div>

    <div id="content">
      <div class="loading">
        <div class="spinner"></div>
        <p>Consultando webhooks de n8n...</p>
      </div>
    </div>
  </div>

  <div class="toast" id="toast">✓ URL copiada</div>

  <script>
    async function loadWebhooks() {
      const content = document.getElementById('content');
      content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Consultando webhooks de n8n...</p></div>';

      try {
        const res = await fetch('/api/webhooks');
        const data = await res.json();

        if (!res.ok) {
          showError(data.error, data.message);
          updateStatus(false, '');
          return;
        }

        updateStatus(true, data.tunnelUrl);
        renderWebhooks(data);
      } catch (err) {
        showError('Error de conexión', err.message);
        updateStatus(false, '');
      }
    }

    function updateStatus(active, tunnelUrl) {
      const dot = document.getElementById('statusDot');
      const label = document.getElementById('statusLabel');
      const url = document.getElementById('statusUrl');

      dot.className = 'status-dot ' + (active ? 'active' : 'inactive');
      label.className = 'status-label ' + (active ? 'active' : 'inactive');
      label.textContent = active ? 'Túnel activo' : 'Túnel desconectado';
      url.textContent = tunnelUrl || '';
    }

    function showError(title, msg) {
      const content = document.getElementById('content');
      content.innerHTML =
        '<div class="error-box"><strong>' + title + '</strong><p style="margin-top:8px">' + (msg || '') + '</p></div>';
    }

    function renderWebhooks(data) {
      const content = document.getElementById('content');
      const webhooks = data.webhooks;

      if (webhooks.length === 0) {
        content.innerHTML =
          '<div class="empty"><h3>No hay webhooks</h3>' +
          '<p>Crea un workflow con un nodo Webhook en <a href="http://localhost:5678" target="_blank" style="color:#818cf8">n8n</a></p></div>';
        return;
      }

      const active = webhooks.filter(w => w.workflowActive).length;
      const inactive = webhooks.length - active;

      let html = '<div class="summary">';
      html += '<div class="summary-card"><div class="num">' + webhooks.length + '</div><div class="label">Total Webhooks</div></div>';
      html += '<div class="summary-card"><div class="num">' + active + '</div><div class="label">Activos</div></div>';
      html += '<div class="summary-card"><div class="num">' + inactive + '</div><div class="label">Inactivos</div></div>';
      html += '</div>';

      html += '<div class="webhook-list">';
      for (const wh of webhooks) {
        const cardClass = wh.workflowActive ? '' : ' inactive';
        const badgeClass = wh.workflowActive ? 'active' : 'inactive';
        const badgeText = wh.workflowActive ? 'Activo' : 'Inactivo';
        const prodUrl = wh.urlProxy;
        const testUrl = wh.urlProxyTest;

        html += '<div class="webhook-card' + cardClass + '">';
        html += '  <div class="wh-top">';
        html += '    <span class="wh-workflow">' + escapeHtml(wh.workflowName) + '</span>';
        html += '    <span class="wh-node">' + escapeHtml(wh.nodeName) + '</span>';
        html += '    <span class="wh-badge ' + badgeClass + '">' + badgeText + '</span>';
        html += '    <span class="wh-method">' + wh.method + '</span>';
        html += '  </div>';

        html += '  <div class="url-row">';
        html += '    <span class="url-label">Prod</span>';
        html += '    <span class="url-value" title="Click para copiar" onclick="copyUrl(this)">' + escapeHtml(prodUrl) + '</span>';
        html += '    <button class="btn-copy" onclick="copyUrl(this.previousElementSibling)">Copiar</button>';
        html += '  </div>';

        html += '  <div class="url-row">';
        html += '    <span class="url-label">Test</span>';
        html += '    <span class="url-value" title="Click para copiar" onclick="copyUrl(this)">' + escapeHtml(testUrl) + '</span>';
        html += '    <button class="btn-copy" onclick="copyUrl(this.previousElementSibling)">Copiar</button>';
        html += '  </div>';

        html += '</div>';
      }
      html += '</div>';

      content.innerHTML = html;
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function copyUrl(el) {
      const url = el.textContent;
      navigator.clipboard.writeText(url).then(() => {
        // Show toast
        const toast = document.getElementById('toast');
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);

        // Flash button
        const btn = el.nextElementSibling;
        if (btn && btn.classList.contains('btn-copy')) {
          btn.textContent = '✓';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('copied'); }, 1500);
        }
      });
    }

    // Load on page load
    loadWebhooks();
    // Auto-refresh every 30 seconds
    setInterval(loadWebhooks, 30000);
  </script>
</body>
</html>`;

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       n8n Webhook Proxy — Started            ║
╠══════════════════════════════════════════════╣
║ Port:       ${String(PORT).padEnd(33)}║
║ Tunnel:     ${(TUNNEL_URL || "not registered").padEnd(33)}║
║ API Key:    ${(N8N_API_KEY ? "configured" : "not set").padEnd(33)}║
╚══════════════════════════════════════════════╝
  `);
});