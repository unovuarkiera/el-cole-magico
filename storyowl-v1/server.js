require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Sin caché para HTML
app.use(function(req, res, next) {
  if (req.path.endsWith('.html') || req.path === '/' || req.path === '/crear') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: 'v1', timestamp: new Date().toISOString(), env: { anthropic: !!process.env.ANTHROPIC_KEY, openai: !!process.env.OPENAI_KEY } });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/crear', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'generator.html'));
});

app.post('/v1/generate', (req, res) => {
  const { name, theme, lang } = req.body;
  console.log('Solicitud: ' + name + ' / ' + theme + ' / ' + lang);
  res.json({ status: 'queued', jobId: 'job_' + Date.now() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('StoryOwl V1 en puerto ' + PORT);
});
