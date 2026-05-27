require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json({ limit: '10mb' }));

const noCache = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v1', timestamp: new Date().toISOString(), env: { anthropic: !!process.env.ANTHROPIC_KEY, openai: !!process.env.OPENAI_KEY } });
});

// HTML routes — served directly with no-cache, bypassing express.static
app.get('/', (req, res) => {
  noCache(res);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/crear', (req, res) => {
  noCache(res);
  const file = path.join(__dirname, 'public', 'generator.html');
  // Read and send fresh every time
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error loading generator');
    res.set('Content-Type', 'text/html');
    res.send(data);
  });
});

app.post('/v1/generate', (req, res) => {
  const { name, theme, lang } = req.body;
  console.log('Solicitud: ' + name + ' / ' + theme + ' / ' + lang);
  res.json({ status: 'queued', jobId: 'job_' + Date.now() });
});

// Static assets (CSS, JS, images) — with cache OK
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('StoryOwl V1 en puerto ' + PORT);
});
