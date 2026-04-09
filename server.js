const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

let TARGET_URL = process.env.TARGET_URL || "http://localhost:5678";
let WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/webhook/test";
let PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Endpoint para obtener la configuración actual (URL del webhook)
app.get("/api/config", (req, res) => {
  res.json({
    webhookUrl: `${PUBLIC_URL}${WEBHOOK_PATH}`,
    publicUrl: PUBLIC_URL,
    webhookPath: WEBHOOK_PATH,
    targetUrl: TARGET_URL
  });
});

// Endpoint para servir template.html con URL inyectada
app.get("/form", (req, res) => {
  const webhookUrl = `${PUBLIC_URL}${WEBHOOK_PATH}`;
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Formulario n8n</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    input { padding: 8px; margin: 10px 0; width: 300px; }
    button { padding: 10px 20px; cursor: pointer; }
  </style>
</head>
<body>
  <h2>Formulario n8n</h2>
  <input type="text" id="nombre" placeholder="Tu nombre" />
  <button onclick="enviar()">Enviar</button>
  <p id="status"></p>

  <script>
    const webhookUrl = "${webhookUrl}";
    console.log("Webhook URL:", webhookUrl);

    function enviar() {
      const status = document.getElementById("status");
      status.textContent = "Enviando...";
      
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: document.getElementById("nombre").value
        })
      })
      .then(response => {
        if (response.ok) {
          status.textContent = "✓ Enviado correctamente!";
          status.style.color = "green";
          document.getElementById("nombre").value = "";
        } else {
          status.textContent = "✗ Error en la respuesta";
          status.style.color = "red";
        }
      })
      .catch(err => {
        console.error("Error:", err);
        status.textContent = "✗ Error: " + err.message;
        status.style.color = "red";
      });
    }
  </script>
</body>
</html>`;
  res.type("text/html").send(html);
});

// Endpoint público estable para el webhook del formulario
app.post("/webhook/test", async (req, res) => {
  const targetUrl = `${TARGET_URL}${WEBHOOK_PATH}`;
  console.log(`[WEBHOOK] Recibiendo petición en /webhook/test, forwardeando a ${targetUrl}`);
  try {
    const headers = {};
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"];
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: JSON.stringify(req.body)
    });

    res.status(response.status);
    response.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });

    const body = await response.text();
    res.send(body);
  } catch (err) {
    console.error("[WEBHOOK ERROR]", err);
    res.status(500).json({ error: "Proxy error", message: err.message });
  }
});

// Proxy genérico para cualquier webhook directo /webhook/*
app.all("/webhook/*", async (req, res) => {
  const targetUrl = `${TARGET_URL}${req.originalUrl}`;
  console.log(`[PROXY] ${req.method} ${req.originalUrl} -> ${targetUrl}`);
  try {
    const headers = { ...req.headers };
    delete headers.host;

    const options = {
      method: req.method,
      headers
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);

    res.status(response.status);
    response.headers.forEach((value, name) => {
      res.setHeader(name, value);
    });

    const body = await response.text();
    res.send(body);
  } catch (err) {
    console.error("[PROXY ERROR]", err);
    res.status(500).json({ error: "Proxy error", message: err.message });
  }
});

// Endpoint para actualizar la configuración
app.post("/api/config", (req, res) => {
  const token = req.headers.authorization;
  if (token !== `Bearer ${process.env.CONFIG_TOKEN || "mysecret"}`) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.body.targetUrl) {
    TARGET_URL = req.body.targetUrl;
    console.log("[CONFIG] TARGET_URL actualizada:", TARGET_URL);
  }

  if (req.body.webhookPath) {
    WEBHOOK_PATH = req.body.webhookPath;
    console.log("[CONFIG] WEBHOOK_PATH actualizada:", WEBHOOK_PATH);
  }

  if (req.body.publicUrl) {
    PUBLIC_URL = req.body.publicUrl;
    console.log("[CONFIG] PUBLIC_URL actualizada:", PUBLIC_URL);
  }

  res.json({
    message: "Configuration updated",
    webhookUrl: `${PUBLIC_URL}${WEBHOOK_PATH}`,
    targetUrl: TARGET_URL,
    webhookPath: WEBHOOK_PATH,
    publicUrl: PUBLIC_URL
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Raíz
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>N8N Proxy - Webhooks</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; max-width: 600px; }
        h1 { color: #333; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        .status { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 20px 0; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>N8N Webhook Proxy</h1>
      <div class="status">
        <h3>Estado del servidor: ✓ Activo</h3>
        <p><strong>Fecha:</strong> ${new Date().toISOString()}</p>
      </div>
      <h3>Endpoints disponibles:</h3>
      <ul>
        <li><code>GET /form</code> - Formulario con webhook inyectado</li>
        <li><code>GET /api/config</code> - Obtener configuración actual</li>
        <li><code>POST /api/config</code> - Actualizar configuración</li>
        <li><code>POST /webhook/test</code> - Webhook de prueba</li>
        <li><code>POST /webhook/*</code> - Proxy genérico de webhooks</li>
        <li><code>GET /health</code> - Health check</li>
      </ul>
      <h3>Configuración actual:</h3>
      <p>
        <strong>PUBLIC_URL:</strong> ${PUBLIC_URL}<br>
        <strong>TARGET_URL:</strong> ${TARGET_URL}<br>
        <strong>WEBHOOK_PATH:</strong> ${WEBHOOK_PATH}<br>
        <strong>Webhook URL:</strong> ${PUBLIC_URL}${WEBHOOK_PATH}
      </p>
      <h3>Enlaces rápidos:</h3>
      <ul>
        <li><a href="/form">Ir al formulario →</a></li>
        <li><a href="/api/config">Ver configuración JSON →</a></li>
      </ul>
    </body>
    </html>
  `);
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║           N8N Webhook Proxy - Iniciado                 ║
╠════════════════════════════════════════════════════════╣
║ Puerto:        ${PORT}
║ Public URL:    ${PUBLIC_URL}
║ Target URL:    ${TARGET_URL}
║ Webhook Path:  ${WEBHOOK_PATH}
║ Webhook URL:   ${PUBLIC_URL}${WEBHOOK_PATH}
╚════════════════════════════════════════════════════════╝
  `);
});