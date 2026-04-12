const express = require("express");
const app = express();

// ─── State ───────────────────────────────────────────────────────────────────
let TUNNEL_URL = process.env.TARGET_URL || ""; // URL del túnel (se registra dinámicamente)
let TUNNEL_REGISTERED_AT = null;
const CONFIG_TOKEN = process.env.CONFIG_TOKEN || "mysecret";

// ─── Middleware ──────────────────────────────────────────────────────────────
// Parse JSON only for /api routes
app.use("/api", express.json());

// ─── API: Register tunnel URL ────────────────────────────────────────────────
app.post("/api/tunnel", (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${CONFIG_TOKEN}`) {
    return res.status(403).json({ error: "Forbidden", message: "Invalid token" });
  }

  const { tunnelUrl } = req.body;
  if (!tunnelUrl) {
    return res.status(400).json({ error: "Missing tunnelUrl in body" });
  }

  TUNNEL_URL = tunnelUrl.replace(/\/+$/, ""); // Remove trailing slashes
  TUNNEL_REGISTERED_AT = new Date().toISOString();
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
    registeredAt: TUNNEL_REGISTERED_AT,
    uptime: process.uptime(),
  });
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
// Proxy ALL webhook requests to the tunnel URL.
// Handles: /webhook/*, /webhook-test/*
// Supports any HTTP method and any content type.
app.all(["/webhook/*", "/webhook-test/*"], (req, res) => {
  if (!TUNNEL_URL) {
    return res.status(503).json({
      error: "Tunnel not configured",
      message: "No tunnel URL registered. Run start.ps1 on your local machine to start the tunnel.",
    });
  }

  const targetUrl = `${TUNNEL_URL}${req.originalUrl}`;
  console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${targetUrl}`);

  // Collect the raw request body
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    try {
      const rawBody = Buffer.concat(chunks);

      // Build headers — forward all except host-related ones
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

      // Attach body for methods that support it
      if (req.method !== "GET" && req.method !== "HEAD" && rawBody.length > 0) {
        fetchOptions.body = rawBody;
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Forward response status
      res.status(response.status);

      // Forward response headers
      response.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (lower === "transfer-encoding" || lower === "connection") return;
        res.setHeader(name, value);
      });

      // Forward response body
      const responseBuffer = Buffer.from(await response.arrayBuffer());
      res.send(responseBuffer);

      console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${response.status}`);
    } catch (err) {
      console.error(`[PROXY ERROR] ${req.method} ${req.originalUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: "Proxy error",
          message: `Could not reach tunnel: ${err.message}`,
        });
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

// ─── Root: Status page ───────────────────────────────────────────────────────
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
    .status { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; background: ${TUNNEL_URL ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border: 1px solid ${statusColor}33; margin-bottom: 20px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; }
    .status-text { color: ${statusColor}; font-weight: 600; }
    .info { margin-bottom: 20px; }
    .info dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 4px; margin-top: 12px; }
    .info dd { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.875rem; color: #cbd5e1; word-break: break-all; }
    .endpoints { list-style: none; margin-top: 16px; }
    .endpoints li { padding: 8px 0; border-bottom: 1px solid #334155; font-size: 0.875rem; }
    .endpoints li:last-child { border: none; }
    code { background: #334155; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .method { color: #60a5fa; font-weight: 600; }
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
      <dt>Usage</dt>
      <dd>Send webhooks to this server's URL + the n8n webhook path</dd>
    </dl>
    <h3 style="font-size: 0.875rem; color: #94a3b8; margin-bottom: 8px;">Endpoints</h3>
    <ul class="endpoints">
      <li><span class="method">ANY</span> <code>/webhook/*</code> → proxy to n8n</li>
      <li><span class="method">ANY</span> <code>/webhook-test/*</code> → proxy to n8n</li>
      <li><span class="method">POST</span> <code>/api/tunnel</code> → register tunnel URL</li>
      <li><span class="method">GET</span> <code>/api/status</code> → tunnel status</li>
      <li><span class="method">GET</span> <code>/health</code> → health check</li>
    </ul>
    <footer>n8n Webhook Proxy &middot; Powered by Render</footer>
  </div>
</body>
</html>`);
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// ─── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       n8n Webhook Proxy — Started            ║
╠══════════════════════════════════════════════╣
║ Port:       ${String(PORT).padEnd(33)}║
║ Tunnel:     ${(TUNNEL_URL || "not registered").padEnd(33)}║
╚══════════════════════════════════════════════╝
  `);
});