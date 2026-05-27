// backend/server.js — StoryOwl V1
// Servidor principal — convive con V0 sin tocarlo
// Puerto: 3001 (V0 usa 3000)

require('dotenv').config({ path: '../.env.v1' });
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── RUTAS ──────────────────────────────────────────────
app.use('/v1/generate', require('./api/routes/generate'));
app.use('/v1/status',   require('./api/routes/status'));
app.use('/v1/purchase', require('./api/routes/purchase'));
app.use('/v1/webhook',  require('./api/routes/webhook'));

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

// ── FRONTEND ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/crear', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/generator.html'));
});

// ── ARRANQUE ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🦉 StoryOwl V1 corriendo en http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Generador: http://localhost:${PORT}/crear`);
});
