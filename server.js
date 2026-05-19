const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('.'));
app.use('/imagenes', express.static('imagenes'));

// Crear carpeta de imágenes si no existe
if (!fs.existsSync('imagenes')) fs.mkdirSync('imagenes');

const ANTHROPIC_KEY = "process.env.ANTHROPIC_KEY";
const OPENAI_KEY = "process.env.OPENAI_KEY";

async function generarImagen(prompt, size, nombreArchivo) {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, quality: 'low', n: 1 })
  });
  const data = await resp.json();
  if (!data.data) throw new Error(JSON.stringify(data));

  const item = data.data[0];
  let imgBuffer;

  if (item.b64_json) {
    imgBuffer = Buffer.from(item.b64_json, 'base64');
  } else {
    const imgResp = await fetch(item.url);
    imgBuffer = Buffer.from(await imgResp.arrayBuffer());
  }

  const filePath = path.join('imagenes', nombreArchivo);
  fs.writeFileSync(filePath, imgBuffer);
  return `/imagenes/${nombreArchivo}`;
}

app.post('/generar-cuento', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, pelo, ojos, personaje, tema } = req.body;
    const id = Date.now();

    send({ tipo: 'estado', mensaje: '🦉 El búho está escribiendo el cuento...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `Eres autor experto de cuentos infantiles en español.
Crea un cuento mágico con estas características:
- Protagonista: ${nombre}, ${edad} años, pelo ${pelo}, ojos ${ojos}
- Personaje especial: ${personaje}
- Tema: ${tema}

RESPONDE SOLO JSON sin texto antes ni después, sin backticks:
{"titulo":"titulo poetico","dedicatoria":"dedicatoria emotiva para ${nombre}","paginas":[
{"numero":1,"titulo":"titulo pagina","texto":"texto 3-4 frases","escena":"detailed scene in English for image"},
{"numero":2,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":3,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":4,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":5,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":6,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":7,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":8,"titulo":"titulo","texto":"texto","escena":"scene"}
]}` }]
    });

    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON encontrado');
    const cuento = JSON.parse(match[0]);

    send({ tipo: 'cuento', titulo: cuento.titulo, dedicatoria: cuento.dedicatoria });

    // Portada
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    const personajeDesc = `A ${edad} year old girl named ${nombre} with ${pelo} hair and ${ojos} eyes`;
    const portadaUrl = await generarImagen(
      `Children's book cover, Pixar quality digital illustration, vibrant warm colors. ${personajeDesc} hugging ${personaje} with kind eyes in a magical glowing forest at sunset. Title in golden Spanish text: "${cuento.titulo}". Professional children's book cover.`,
      '1024x1536',
      `portada_${id}.png`
    );
    send({ tipo: 'imagen', url: portadaUrl });

    // Páginas
    for (const pag of cuento.paginas) {
      send({ tipo: 'estado', mensaje: `🎨 Generando ilustración página ${pag.numero}...` });
      const imgUrl = await generarImagen(
        `Children's book illustration, Pixar quality, vibrant warm colors. ${personajeDesc} and ${personaje} with kind eyes. Scene: ${pag.escena}. Horizontal format, magical atmosphere.`,
        '1536x1024',
        `pag_${id}_${pag.numero}.png`
      );
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto: pag.texto, url: imgUrl });
    }

    send({ tipo: 'completado' });
    res.end();

  } catch (err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});

app.listen(3000, () => console.log('🦉 El Cole Mágico corriendo en http://localhost:3000'));
