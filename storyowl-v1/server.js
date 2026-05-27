// server.js — StoryOwl V1
require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString(),
    env: {
      anthropic: !!process.env.ANTHROPIC_KEY,
      openai: !!process.env.OPENAI_KEY,
    }
  });
});

// ── FRONTEND ROUTES ────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/crear', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'generator.html'));
});

// ── API (stub — workers se añaden en siguiente fase) ───
app.post('/v1/generate', (req, res) => {
  const { name, theme, lang } = req.body;
  console.log(`📖 Solicitud recibida: ${name} / ${theme} / ${lang}`);
  res.json({
    status: 'queued',
    message: 'Generación en cola — workers en construcción',
    jobId: 'job_' + Date.now()
  });
});

// ── ARRANQUE ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🦉 StoryOwl V1 corriendo en puerto ${PORT}`);
  console.log(`   Landing:   /`);
  console.log(`   Generador: /crear`);
  console.log(`   Health:    /health`);
});
