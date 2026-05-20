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

// =============================================
// COLECCIÓN ESPECIAL: CUENTO DE CUMPLEAÑOS
// Historia fija de 16 páginas, solo cambian los personajes
// =============================================

const ESCENAS_CUMPLE = [
  { numero:1, titulo:"El gran día ha llegado", texto_base:"[NOMBRE] se despierta con una sonrisa enorme. ¡Hoy es su cumpleaños! Se levanta de un salto y corre a la ventana — el sol brilla especialmente para [NOMBRE] hoy.", escena:"A child waking up in a cozy bedroom decorated with birthday balloons, sunlight streaming through curtains, excited expression, looking out the window at a sunny day" },
  { numero:2, titulo:"Nadie lo recuerda", texto_base:"En el cole, [NOMBRE] espera que alguien le diga algo... pero sus amigos hablan de otras cosas. La maestra tampoco dice nada. ¡Qué raro! Quizás todos han olvidado su cumpleaños.", escena:"A child sitting alone in a classroom looking sad and confused, other children playing and talking nearby, nobody paying attention to the birthday child, bittersweet expression" },
  { numero:3, titulo:"Un día muy largo", texto_base:"Las horas pasan lentas. [NOMBRE] mira el reloj una y otra vez. Al final suena el timbre. Con los hombros caídos, [NOMBRE] sale del cole pensando que este es el peor cumpleaños del mundo.", escena:"A child walking out of school alone looking disappointed, head slightly down, carrying a backpack, afternoon sunlight, empty schoolyard" },
  { numero:4, titulo:"¡Aparece el amigo especial!", texto_base:"De repente, [PERSONAJE] aparece en la esquina con una enorme sonrisa. ¡Le estaba esperando! \"¡Ven conmigo!\" dice [PERSONAJE] misteriosamente. \"Tengo algo que mostrarte.\"", escena:"A magical friend character appearing cheerfully around a street corner, waving excitedly at the sad child, mysterious and happy expression, magical sparkles around them" },
  { numero:5, titulo:"El camino a casa", texto_base:"[PERSONAJE] lleva a [NOMBRE] de vuelta a casa. Por el camino, [NOMBRE] nota que [PERSONAJE] no para de sonreír. \"¿Qué pasa?\" pregunta [NOMBRE]. \"¡Ya verás!\" responde [PERSONAJE] con picardía.", escena:"The special character and child walking together toward a house, character looking playfully secretive, child curious and confused, warm afternoon light, colorful street" },
  { numero:6, titulo:"¡SORPRESA!", texto_base:"[NOMBRE] abre la puerta y... ¡SORPRESA! Todos sus amigos y familiares saltan de detrás de los muebles. Globos de colores llenan el salón. ¡Nadie había olvidado el cumpleaños!", escena:"A living room FULL of colorful balloons, streamers, and decorations, many friends and family jumping out and yelling surprise, the birthday child at the door with a shocked and delighted expression, confetti in the air" },
  { numero:7, titulo:"Lágrimas de alegría", texto_base:"[NOMBRE] se queda con la boca abierta. ¡Qué sorpresa tan grande! Los ojos se le llenan de lágrimas de felicidad. [PERSONAJE] le da un abrazo enorme. \"¿Lo sabías todo el tiempo?\", pregunta [NOMBRE] riendo.", escena:"The birthday child crying happy tears, being hugged by the special character, surrounded by loving family and friends, warm and emotional atmosphere, everyone smiling" },
  { numero:8, titulo:"¡Empieza la fiesta!", texto_base:"¡La música empieza a sonar! Todo el salón está decorado con sus colores favoritos. Hay globos, serpentinas y carteles que dicen \"¡Feliz Cumpleaños [NOMBRE]!\". ¡Es la fiesta más espectacular del mundo!", escena:"A spectacular birthday party in full swing, colorful decorations everywhere, happy birthday banners, balloons and streamers, music notes floating in the air, everyone dancing and celebrating" },
  { numero:9, titulo:"Los juegos locos", texto_base:"¡Llegan los juegos! [PERSONAJE] organiza una carrera de sacos que acaba con todos rodando por el suelo de risa. [NOMBRE] gana la carrera y todos aplauden y celebran.", escena:"Children playing party games, a sack race with everyone laughing and falling, the birthday child winning, the special character cheering and organizing the games, pure joy and laughter" },
  { numero:10, titulo:"El baile más divertido", texto_base:"Suena la canción favorita de [NOMBRE] y todo el mundo sale a bailar. [PERSONAJE] tiene los mejores pasos de baile que nadie ha visto jamás. ¡[NOMBRE] y [PERSONAJE] bailan juntos en el centro!", escena:"Everyone dancing at the birthday party, the birthday child and special character dancing together in the center, funny dance moves, everyone laughing and clapping, colorful disco lights" },
  { numero:11, titulo:"La canción más especial", texto_base:"De repente, la música para. Todos se colocan en círculo alrededor de [NOMBRE]. Empiezan a cantar \"¡Cumpleaños Feliz!\" a todo pulmón. [NOMBRE] se sonroja de la emoción.", escena:"Everyone gathered in a circle singing Happy Birthday, the birthday child in the center blushing happily, everyone clapping and smiling, warm candlelight, festive atmosphere" },
  { numero:12, titulo:"La tarta mágica", texto_base:"[PERSONAJE] trae la tarta más impresionante que [NOMBRE] ha visto jamás. Tiene [EDAD] velas encendidas que brillan como estrellas. \"¡[EDAD] añitos!\" gritan todos.", escena:`A spectacular birthday cake being brought in with exactly [EDAD] lit candles glowing brightly, the birthday child's amazed face illuminated by candlelight, everyone gathered around, the special character carrying the cake proudly` },
  { numero:13, titulo:"El deseo secreto", texto_base:"[NOMBRE] cierra los ojos con fuerza y piensa en su deseo más especial. El silencio llena la habitación. Todos esperan con la respiración contenida. ¡Este deseo tiene que hacerse realidad!", escena:"The birthday child closing their eyes tightly to make a wish, candles glowing on the cake, everyone watching in silence with hopeful expressions, magical sparkles around the child, intimate and magical moment" },
  { numero:14, titulo:"¡A soplar!", texto_base:"[NOMBRE] coge aire... y ¡SOPLA! Las [EDAD] velas se apagan de golpe. ¡Todos aplauden y gritan de alegría! [PERSONAJE] da saltos de felicidad. \"¡El deseo se cumplirá!\", dice [PERSONAJE].", escena:"The birthday child blowing out all the candles at once, smoke rising from the extinguished candles, everyone cheering and clapping with joy, the special character jumping with happiness, confetti raining down" },
  { numero:15, titulo:"Los regalos", texto_base:"Llega el momento de los regalos. [PERSONAJE] le entrega a [NOMBRE] un paquete envuelto en papel dorado con un lazo enorme. \"Este es de mi parte\", dice [PERSONAJE] con ternura. Dentro hay exactamente lo que [NOMBRE] había deseado.", escena:"Opening birthday presents, the special character giving a beautifully wrapped gold present with a big bow, the birthday child opening it with excitement, warm lighting, gift wrapping paper scattered around, love and tenderness in the scene" },
  { numero:16, titulo:"El mejor día del mundo", texto_base:"Por la noche, [NOMBRE] se mete en la cama feliz y cansado. \"Fue el mejor cumpleaños del mundo\", susurra abrazando su almohada. [PERSONAJE] le guiña un ojo desde la ventana. \"¡Hasta el año que viene!\"", escena:"The birthday child lying happily in bed, cozy bedroom with birthday decorations still visible, the special character waving goodbye from the window, peaceful and warm evening light, a smile on the child's face, balloons floating around" }
];

app.post('/generar-cumple', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, personaje, opciones, estilo } = req.body;
    const id = Date.now();

    const genero = opciones?.genero || 'niño';
    const piel = opciones?.piel || 'light, fair skin';
    const pelo = opciones?.pelo || 'brown';
    const tipopelo = opciones?.tipopelo || 'straight';
    const ojos = opciones?.ojos || 'brown';
    const gafas = opciones?.gafas || 'without glasses';
    const pecas = opciones?.pecas || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;

    const protagonistaDesc = `a ${edad}-year-old ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    send({ tipo: 'estado', mensaje: '🎂 Creando los personajes de la fiesta...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // Descripción visual fija del personaje especial
    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera una descripción visual detallada y consistente en inglés para este personaje de cuento infantil: "${personaje}".
Incluye: colores exactos, ropa o características físicas fijas, rasgos distintivos. Máximo 40 palabras. Solo la descripción, sin explicaciones.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();

    // Título y dedicatoria personalizados
    send({ tipo: 'estado', mensaje: '🎂 Escribiendo la historia...' });
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético y emotivo para un cuento de cumpleaños donde el protagonista se llama ${nombre} y cumple ${edad} años. Su personaje especial es ${personaje}.
También genera una dedicatoria emotiva de 2-3 frases para ${nombre}.
Responde SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    // Portada
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Birthday book cover: ${protagonistaDesc} with ${personajeDesc} surrounded by colorful balloons, confetti, and birthday decorations. Festive and joyful atmosphere. Spanish title: "${tituloData.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536',
        `cumple_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // 16 páginas con historia fija, solo cambian los personajes
    for (const escena of ESCENAS_CUMPLE) {
      send({ tipo: 'estado', mensaje: `🎨 Generando página ${escena.numero} de 16...` });

      // Personalizar texto con nombre, personaje y edad
      const texto = escena.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[EDAD\]/g, edad);

      const escenaImg = escena.escena
        .replace(/\[EDAD\]/g, edad)
        .replace(/the birthday child/g, protagonistaDesc)
        .replace(/the special character/g, personajeDesc);

      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          `${estiloBase}. ${escenaImg}. Characters: ${protagonistaDesc} and ${personajeDesc}. Portrait format, consistent character design throughout the book.`,
          '1024x1536',
          `cumple_${id}_${escena.numero}.png`
        );
      } catch(e) {
        console.error(`Error página ${escena.numero}:`, e.message);
      }

      send({ tipo: 'pagina', numero: escena.numero, titulo: escena.titulo, texto, url: imgUrl });
    }

    send({ tipo: 'completado' });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});
