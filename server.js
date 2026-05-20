const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('.'));
app.use('/imagenes', express.static('imagenes'));

if (!fs.existsSync('imagenes')) fs.mkdirSync('imagenes');

const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
const OPENAI_KEY = process.env.OPENAI_KEY;

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

    // Descripción fija y consistente del protagonista y personaje secundario
    // Se usa IGUAL en portada y en todas las páginas para mantener coherencia visual
    const colorPelo = pelo.includes('rubio') ? 'bright blonde' :
                      pelo.includes('castaño') ? 'brown' :
                      pelo.includes('moreno') ? 'dark black' : 'red';
    const colorOjos = ojos === 'marrones' ? 'brown' :
                      ojos === 'azules' ? 'blue' :
                      ojos === 'verdes' ? 'green' : 'dark';
    const esLiso = pelo.includes('liso') ? 'straight' : 'curly';

    const protagonistaDesc = `a ${edad}-year-old child named ${nombre} with ${esLiso} ${colorPelo} hair, ${colorOjos} eyes, wearing a yellow t-shirt and blue dungarees`;
    const personajeDesc = `${personaje} (always drawn with the same friendly appearance, consistent colors and features across all illustrations)`;
    const estiloBase = `Children's book illustration, Pixar CGI quality, warm soft lighting, vibrant colors, family-friendly, cheerful and safe for children`;

    // Portada
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover showing ${protagonistaDesc} hugging ${personajeDesc} in a magical glowing forest at sunset. Golden title text in Spanish: "${cuento.titulo}". Professional children's book cover layout.`,
        '1024x1536',
        `portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch (e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // Páginas — si una imagen falla, el cuento continúa sin ella
    for (const pag of cuento.paginas) {
      send({ tipo: 'estado', mensaje: `🎨 Generando ilustración página ${pag.numero}...` });
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          `${estiloBase}. ${protagonistaDesc} and ${personajeDesc}. Scene: ${pag.escena}. Horizontal format, magical atmosphere, same character designs as previous illustrations.`,
          '1536x1024',
          `pag_${id}_${pag.numero}.png`
        );
      } catch (e) {
        console.error(`Error imagen página ${pag.numero}:`, e.message);
      }
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
