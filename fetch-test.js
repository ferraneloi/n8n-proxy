fetch('https://n8n-proxy-b2m9.onrender.com/webhook/test-form', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br'
  },
  body: JSON.stringify({ nombre: 'ferran' })
})
.then(async r => console.log('Status:', r.status, 'Body:', await r.text()))
.catch(e => console.error('fetch error:', e));
