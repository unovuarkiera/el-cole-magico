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

// ── FRONTEND ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: '🦉 StoryOwl V1 online', status: 'ok' });
});

// ── ARRANQUE ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🦉 StoryOwl V1 corriendo en puerto ${PORT}`);
  console.log(`   Health: /health`);
});
