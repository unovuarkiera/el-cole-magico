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
    const { nombre, edad, tema, personaje, opciones, estilo } = req.body;
    const id = Date.now();

    const genero = opciones?.genero || 'protagonista';
    const piel = opciones?.piel || 'light, fair skin';
    const pelo = opciones?.pelo || 'brown';
    const tipopelo = opciones?.tipopelo || 'straight';
    const ojos = opciones?.ojos || 'brown';
    const gafas = opciones?.gafas || 'without glasses';
    const pecas = opciones?.pecas || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;

    // Descripción fija del protagonista
    const protagonistaDesc = `a ${edad}-year-old ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    const tonoEdad = edad <= 5 ? 'muy sencillo, frases cortas, vocabulario básico, máximo 2 frases por página' :
                     edad <= 8 ? 'sencillo, frases cortas, aventuras y humor, 3-4 frases por página' :
                     edad <= 11 ? 'intermedio, algo de misterio y emoción, 4-5 frases por página' :
                                  'avanzado, trama más elaborada, personajes con profundidad, 5-6 frases por página';

    send({ tipo: 'estado', mensaje: '🦉 El búho está creando los personajes...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // PASO 1: Claude genera descripción visual fija del personaje secundario
    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera una descripción visual detallada y consistente en inglés para este personaje de cuento infantil: "${personaje}".
La descripción debe incluir: colores exactos, ropa o características físicas fijas, rasgos distintivos.
Debe ser suficientemente detallada para que un generador de imágenes lo dibuje IGUAL en todas las ilustraciones.
Responde SOLO con la descripción en inglés, sin explicaciones, máximo 40 palabras.` }]
    });

    const personajeDesc = msgPersonaje.content[0].text.trim();

    send({ tipo: 'estado', mensaje: '🦉 El búho está escribiendo el cuento...' });

    // PASO 2: Claude genera el cuento con 16 páginas
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 5000,
      messages: [{ role: 'user', content: `Eres autor experto de cuentos infantiles en español.
Crea un cuento mágico con estas características:
- Protagonista: ${nombre}, ${edad} años, ${genero}
- Personaje especial: ${personaje}
- Tema: ${tema}
- Tono y nivel: ${tonoEdad}

El cuento debe tener una estructura narrativa completa con introducción, desarrollo y desenlace en 16 páginas.

RESPONDE SOLO JSON sin texto antes ni después, sin backticks:
{"titulo":"titulo poetico","dedicatoria":"dedicatoria emotiva para ${nombre}","paginas":[
{"numero":1,"titulo":"titulo pagina","texto":"texto adaptado a la edad","escena":"detailed scene in English for image generation"},
{"numero":2,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":3,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":4,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":5,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":6,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":7,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":8,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":9,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":10,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":11,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":12,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":13,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":14,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":15,"titulo":"titulo","texto":"texto","escena":"scene"},
{"numero":16,"titulo":"titulo","texto":"texto","escena":"scene"}
]}` }]
    });

    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON encontrado');
    const cuento = JSON.parse(match[0]);

    send({ tipo: 'cuento', titulo: cuento.titulo, dedicatoria: cuento.dedicatoria });

    // PASO 3: Portada — vertical, personaje y secundario con descripciones fijas
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} with ${personajeDesc} in a magical glowing forest at sunset. Spanish title text: "${cuento.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536',
        `portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch (e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // PASO 4: Páginas — todas verticales, personajes con descripciones fijas
    for (const pag of cuento.paginas) {
      send({ tipo: 'estado', mensaje: `🎨 Generando ilustración página ${pag.numero} de ${cuento.paginas.length}...` });
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          `${estiloBase}. ${protagonistaDesc} and ${personajeDesc}. Scene: ${pag.escena}. Portrait format, magical atmosphere, consistent character design throughout the book.`,
          '1024x1536',
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
