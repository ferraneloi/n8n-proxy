const express = require("express");

const app = express();
app.use(express.json());

let TARGET = process.env.TARGET_URL || "http://localhost:5678"; // URL inicial de Tunnelmole

// Proxy de webhook
app.post("/webhook/test", async (req, res) => {
  try {
    const response = await fetch(`${TARGET}/webhook/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.text();
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error proxy");
  }
});

// Endpoint para actualizar URL dinámicamente
app.post("/set-url", (req, res) => {
  const token = req.headers.authorization;
  if (token !== "mysecret") {
    return res.status(403).send("Forbidden");
  }

  TARGET = req.body.url;
  console.log("Nueva URL Tunnelmole:", TARGET);
  res.send("OK");
});

// Arrancar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));