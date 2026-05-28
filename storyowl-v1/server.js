require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json({ limit: '10mb' }));

function noCache(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString(),
    env: {
      anthropic: !!process.env.ANTHROPIC_KEY,
      openai: !!process.env.OPENAI_KEY
    }
  });
});

app.get('/', (req, res) => {
  noCache(res);
  fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error');
    res.set('Content-Type', 'text/html');
    res.send(data);
  });
});

app.get('/crear', (req, res) => {
  noCache(res);
  fs.readFile(path.join(__dirname, 'public', 'generator.html'), 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error');
    res.set('Content-Type', 'text/html');
    res.send(data);
  });
});

app.post('/v1/generate', (req, res) => {
  console.log('Generate request:', req.body.nombre, req.body.tema);
  res.json({ status: 'queued', jobId: 'job_' + Date.now() });
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('StoryOwl V1 running on port ' + PORT);
});
