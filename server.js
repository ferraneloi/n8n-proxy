const express = require("express");

const app = express();
app.use(express.json());

let TARGET = process.env.TARGET_URL || "http://localhost:5678"; // URL inicial de Tunnelmole
let WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/webhook/test";

// Endpoint público estable para el webhook del formulario
app.post("/webhook/test", async (req, res) => {
  const targetUrl = `${TARGET}${WEBHOOK_PATH}`;
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
    console.error("Proxy error:", err);
    res.status(500).send("Error proxy");
  }
});

// Proxy de cualquier otro webhook directo /webhook/*
app.all("/webhook/*", async (req, res) => {
  const targetUrl = `${TARGET}${req.originalUrl}`;
  try {
    const headers = {};
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"];
    }

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
    console.error("Proxy error:", err);
    res.status(500).send("Error proxy");
  }
});

// Endpoint para actualizar URL dinámicamente y el path real del webhook
app.post("/set-url", (req, res) => {
  const token = req.headers.authorization;
  if (token !== "mysecret") {
    return res.status(403).send("Forbidden");
  }

  TARGET = req.body.url;
  if (req.body.webhookPath) {
    WEBHOOK_PATH = req.body.webhookPath;
    console.log("Webhook interno establecido en:", WEBHOOK_PATH);
  }
  console.log("Nueva URL Tunnelmole:", TARGET);
  res.send("OK");
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));