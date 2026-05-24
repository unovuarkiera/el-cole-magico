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
const OPENAI_KEY    = process.env.OPENAI_KEY;

// ─────────────────────────────────────────────────────────────
// GENERADOR DE IMÁGENES — gpt-image-2
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// PROMPT BASE PARA SPREADS — imagen panorámica efecto libro
// Las imágenes landscape 1536x1024 simulan el libro abierto.
// El prompt pide composición izquierda / derecha natural con
// lomo implícito en el centro y ligera curvatura de página.
// ─────────────────────────────────────────────────────────────
function spreadPrompt(estiloBase, protagonistaDesc, personajeDesc, escenaIzq, escenaDer) {
  return `${estiloBase}. Open children's book double-page spread, landscape format. ` +
    `Seamless panoramic illustration with natural spine shadow in the center and subtle page curl at edges. ` +
    `LEFT PAGE: ${escenaIzq}. RIGHT PAGE: ${escenaDer}. ` +
    `Characters: ${protagonistaDesc} and ${personajeDesc}. ` +
    `Consistent character design across both pages. Warm lighting, rich colors, professional children's book quality.`;
}


// ═════════════════════════════════════════════════════════════
// RUTA: /generar-cuento  (cuento libre personalizado)
// 10 spreads horizontales → 20 páginas de contenido
// ═════════════════════════════════════════════════════════════
app.post('/generar-cuento', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, tema, personaje, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero           = opciones?.genero    || 'protagonista';
    const piel             = opciones?.piel      || 'light, fair skin';
    const pelo             = opciones?.pelo      || 'brown';
    const tipopelo         = opciones?.tipopelo  || 'straight';
    const ojos             = opciones?.ojos      || 'brown';
    const gafas            = opciones?.gafas     || 'without glasses';
    const pecas            = opciones?.pecas     || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;

    const protagonistaDesc = `a ${edad}-year-old ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    const tonoEdad = edad <= 5  ? 'muy sencillo, frases cortas, vocabulario básico, máximo 2 frases por página' :
                     edad <= 8  ? 'sencillo, frases cortas, aventuras y humor, 3-4 frases por página' :
                     edad <= 11 ? 'intermedio, algo de misterio y emoción, 4-5 frases por página' :
                                  'avanzado, trama más elaborada, personajes con profundidad, 5-6 frases por página';

    send({ tipo: 'estado', mensaje: '🦉 El búho está creando los personajes...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // PASO 1: Descripción visual fija del personaje secundario
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

    // PASO 2: Claude genera el cuento — 10 spreads (20 páginas)
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      messages: [{ role: 'user', content: `Eres autor experto de cuentos infantiles en español.
Crea un cuento mágico con estas características:
- Protagonista: ${nombre}, ${edad} años, ${genero}
- Personaje especial: ${personaje}
- Tema: ${tema}
- Tono y nivel: ${tonoEdad}

El cuento tiene 10 spreads (dobles páginas), cada spread = 2 páginas consecutivas con una escena panorámica continua.
Estructura narrativa completa: introducción (spreads 1-2), desarrollo (spreads 3-7), clímax (spread 8), desenlace (spreads 9-10).

RESPONDE SOLO JSON sin texto antes ni después, sin backticks:
{"titulo":"titulo poetico","dedicatoria":"dedicatoria emotiva para ${nombre}","spreads":[
{"spread":1,
  "pagIzq":{"numero":1,"titulo":"titulo pag izq","texto":"texto adaptado a la edad"},
  "pagDer":{"numero":2,"titulo":"titulo pag der","texto":"texto adaptado a la edad"},
  "escenaIzq":"detailed scene description in English for left page image generation",
  "escenaDer":"detailed scene description in English for right page image generation"},
{"spread":2,
  "pagIzq":{"numero":3,"titulo":"...","texto":"..."},
  "pagDer":{"numero":4,"titulo":"...","texto":"..."},
  "escenaIzq":"...","escenaDer":"..."},
{"spread":3,"pagIzq":{"numero":5,"titulo":"...","texto":"..."},"pagDer":{"numero":6,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":4,"pagIzq":{"numero":7,"titulo":"...","texto":"..."},"pagDer":{"numero":8,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":5,"pagIzq":{"numero":9,"titulo":"...","texto":"..."},"pagDer":{"numero":10,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":6,"pagIzq":{"numero":11,"titulo":"...","texto":"..."},"pagDer":{"numero":12,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":7,"pagIzq":{"numero":13,"titulo":"...","texto":"..."},"pagDer":{"numero":14,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":8,"pagIzq":{"numero":15,"titulo":"...","texto":"..."},"pagDer":{"numero":16,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":9,"pagIzq":{"numero":17,"titulo":"...","texto":"..."},"pagDer":{"numero":18,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."},
{"spread":10,"pagIzq":{"numero":19,"titulo":"...","texto":"..."},"pagDer":{"numero":20,"titulo":"...","texto":"..."},"escenaIzq":"...","escenaDer":"..."}
]}` }]
    });

    const text  = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON encontrado en respuesta de Claude');
    const cuento = JSON.parse(match[0]);

    send({ tipo: 'cuento', titulo: cuento.titulo, dedicatoria: cuento.dedicatoria });

    // PASO 3: Portada vertical 1024x1536
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} with ${personajeDesc} in a magical glowing forest at sunset. Epic adventure mood. Spanish title text: "${cuento.titulo}". Professional children's book cover, portrait format 1024x1536.`,
        '1024x1536', `portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // PASO 4: 10 spreads horizontales 1536x1024
    for (const sp of cuento.spreads) {
      send({ tipo: 'estado', mensaje: `🎨 Generando spread ${sp.spread} de 10...` });
      let imgUrl = '';
      try {
        const prompt = spreadPrompt(estiloBase, protagonistaDesc, personajeDesc, sp.escenaIzq, sp.escenaDer);
        imgUrl = await generarImagen(prompt, '1536x1024', `spread_${id}_${sp.spread}.png`);
      } catch(e) {
        console.error(`Error spread ${sp.spread}:`, e.message);
      }
      // Enviamos el spread completo con los datos de ambas páginas y la URL de imagen compartida
      send({
        tipo: 'spread',
        spread: sp.spread,
        url: imgUrl,
        pagIzq: sp.pagIzq,
        pagDer: sp.pagDer
      });
    }

    send({
      tipo: 'completado',
      dedicatoriaPersonal: dedicatoriaPersonal || '',
      nombre,
      fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: CUENTO DE CUMPLEAÑOS
// Historia fija de 10 spreads
// ═════════════════════════════════════════════════════════════
const SPREADS_CUMPLE = [
  { spread: 1,
    pagIzq: { numero: 1,  titulo: "El gran día ha llegado",    texto_base: "[NOMBRE] se despierta con una sonrisa enorme. ¡Hoy es su cumpleaños! Se levanta de un salto y corre a la ventana — el sol brilla especialmente para [NOMBRE] hoy." },
    pagDer: { numero: 2,  titulo: "Nadie lo recuerda",         texto_base: "En el cole, [NOMBRE] espera que alguien le diga algo... pero sus amigos hablan de otras cosas. La maestra tampoco dice nada. ¡Qué raro! Quizás todos han olvidado su cumpleaños." },
    escenaIzq: "child waking up joyfully in a birthday-decorated bedroom, balloons, morning sunlight streaming in",
    escenaDer:  "same child sitting sadly in a sunny classroom while friends talk among themselves ignoring them" },

  { spread: 2,
    pagIzq: { numero: 3,  titulo: "Un día muy largo",          texto_base: "Las horas pasan lentas. [NOMBRE] mira el reloj una y otra vez. Al final suena el timbre. Con los hombros caídos, [NOMBRE] sale del cole pensando que este es el peor cumpleaños del mundo." },
    pagDer: { numero: 4,  titulo: "¡Aparece el amigo especial!", texto_base: "De repente, [PERSONAJE] aparece en la esquina con una enorme sonrisa. ¡Le estaba esperando! '¡Ven conmigo!', dice [PERSONAJE] misteriosamente." },
    escenaIzq: "child walking out of school alone looking disappointed, afternoon light, empty street",
    escenaDer:  "magical friend character appearing cheerfully at a colorful street corner with sparkles and a big smile" },

  { spread: 3,
    pagIzq: { numero: 5,  titulo: "El camino a casa",          texto_base: "[PERSONAJE] lleva a [NOMBRE] de vuelta a casa. Por el camino, [NOMBRE] nota que [PERSONAJE] no para de sonreír. '¿Qué pasa?', pregunta [NOMBRE]. '¡Ya verás!', responde [PERSONAJE] con picardía." },
    pagDer: { numero: 6,  titulo: "¡SORPRESA!",                texto_base: "[NOMBRE] abre la puerta y... ¡SORPRESA! Todos sus amigos y familiares saltan de detrás de los muebles. Globos de colores llenan el salón. ¡Nadie había olvidado el cumpleaños!" },
    escenaIzq: "child and magical friend walking home on a colorful street, friend smiling secretively and winking",
    escenaDer:  "explosion of colorful balloons and confetti as door opens, surprised happy faces jumping out from behind furniture" },

  { spread: 4,
    pagIzq: { numero: 7,  titulo: "Lágrimas de alegría",       texto_base: "[NOMBRE] se queda con la boca abierta. Los ojos se le llenan de lágrimas de felicidad. [PERSONAJE] le da un abrazo enorme. '¿Lo sabías todo el tiempo?', pregunta [NOMBRE] riendo." },
    pagDer: { numero: 8,  titulo: "¡Empieza la fiesta!",       texto_base: "¡La música empieza a sonar! Todo el salón está decorado con sus colores favoritos. Hay globos, serpentinas y carteles. ¡Es la fiesta más espectacular del mundo!" },
    escenaIzq: "emotional hug between child and magical friend, happy tears, warm golden light, cozy living room",
    escenaDer:  "spectacular birthday party in full swing, music notes floating, colorful decorations, everyone dancing and laughing" },

  { spread: 5,
    pagIzq: { numero: 9,  titulo: "Los juegos locos",          texto_base: "¡Llegan los juegos! [PERSONAJE] organiza una carrera de sacos que acaba con todos rodando por el suelo de risa. [NOMBRE] gana y todos aplauden y celebran." },
    pagDer: { numero: 10, titulo: "El baile más divertido",    texto_base: "Suena la canción favorita de [NOMBRE] y todo el mundo sale a bailar. [PERSONAJE] tiene los mejores pasos de baile. ¡[NOMBRE] y [PERSONAJE] bailan juntos en el centro!" },
    escenaIzq: "children playing sack race, everyone laughing and falling, colorful garden party",
    escenaDer:  "everyone dancing wildly at the party, child and magical friend dancing together in spotlight" },

  { spread: 6,
    pagIzq: { numero: 11, titulo: "La canción más especial",   texto_base: "De repente, la música para. Todos se colocan en círculo alrededor de [NOMBRE]. Empiezan a cantar '¡Cumpleaños Feliz!' a todo pulmón. [NOMBRE] se sonroja de la emoción." },
    pagDer: { numero: 12, titulo: "La tarta mágica",           texto_base: "[PERSONAJE] trae la tarta más impresionante que [NOMBRE] ha visto jamás. Tiene [EDAD] velas encendidas que brillan como estrellas. '¡[EDAD] añitos!', gritan todos." },
    escenaIzq: "everyone singing in a circle around the glowing child, candlelight warmth, hands joined",
    escenaDer:  "spectacular birthday cake with glowing candles being carried in, amazed faces lit by candlelight" },

  { spread: 7,
    pagIzq: { numero: 13, titulo: "El deseo secreto",          texto_base: "[NOMBRE] cierra los ojos con fuerza y piensa en su deseo más especial. El silencio llena la habitación. Todos esperan con la respiración contenida." },
    pagDer: { numero: 14, titulo: "¡A soplar!",                texto_base: "[NOMBRE] coge aire... y ¡SOPLA! Las [EDAD] velas se apagan de golpe. ¡Todos aplauden y gritan de alegría! [PERSONAJE] da saltos de felicidad." },
    escenaIzq: "child closing eyes tightly making a wish, magical sparkles swirling, everyone watching in hopeful silence",
    escenaDer:  "child blowing out all candles, smoke curling up, confetti raining, everyone cheering with pure joy" },

  { spread: 8,
    pagIzq: { numero: 15, titulo: "Los regalos",               texto_base: "Llega el momento de los regalos. [PERSONAJE] le entrega a [NOMBRE] un paquete envuelto en papel dorado. Dentro hay exactamente lo que [NOMBRE] había deseado." },
    pagDer: { numero: 16, titulo: "¡Lo que más quería!",       texto_base: "[NOMBRE] abre el regalo y sus ojos se iluminan. '¡Es lo que quería!', grita emocionado. [PERSONAJE] le guiña un ojo. Siempre supo cuál era el deseo secreto." },
    escenaIzq: "child receiving beautifully wrapped golden gift from magical friend, surrounded by love",
    escenaDer:  "child opening gift with pure joy and amazement, magical glow emanating from the box" },

  { spread: 9,
    pagIzq: { numero: 17, titulo: "La foto del recuerdo",      texto_base: "Antes de que acabe la fiesta, todos se juntan para la foto. [NOMBRE] está en el centro rodeado de sus personas favoritas. '¡Uno, dos, tres... patata!', dice [PERSONAJE] y todos se ríen." },
    pagDer: { numero: 18, titulo: "Los últimos abrazos",       texto_base: "Los amigos se van despidiendo uno a uno con abrazos enormes. [NOMBRE] les dice adiós desde la puerta. El corazón está tan lleno que casi no cabe más felicidad." },
    escenaIzq: "group photo moment, child in center surrounded by friends and family, big smiles and laughter",
    escenaDer:  "child waving goodbye to friends from doorstep, warm evening light, heart-shaped light in the sky" },

  { spread: 10,
    pagIzq: { numero: 19, titulo: "Contando las estrellas",    texto_base: "Esa noche, [NOMBRE] y [PERSONAJE] salen al jardín a contar estrellas. '¿Cuántas hay?', pregunta [NOMBRE]. 'Una por cada momento feliz de hoy', responde [PERSONAJE]." },
    pagDer: { numero: 20, titulo: "El mejor cumpleaños",       texto_base: "En la cama, [NOMBRE] sonríe en la oscuridad. Hoy ha sido el mejor cumpleaños del mundo. Y antes de dormirse, susurra: 'Gracias, [PERSONAJE]'. Una estrella brilla un poco más fuerte." },
    escenaIzq: "child and magical friend lying on grass counting stars, magical night sky full of glowing constellations",
    escenaDer:  "child sleeping peacefully in bed with happy smile, birthday decorations visible, one star shining extra bright through window" }
];

app.post('/generar-cumple', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, personaje, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero            = opciones?.genero   || 'niño';
    const piel              = opciones?.piel     || 'light, fair skin';
    const pelo              = opciones?.pelo     || 'brown';
    const tipopelo          = opciones?.tipopelo || 'straight';
    const ojos              = opciones?.ojos     || 'brown';
    const gafas             = opciones?.gafas    || 'without glasses';
    const pecas             = opciones?.pecas    || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;
    const protagonistaDesc  = `a ${edad}-year-old ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    send({ tipo: 'estado', mensaje: '🎂 Creando los personajes de la fiesta...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // Descripción visual fija del personaje especial
    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera una descripción visual detallada y consistente en inglés para este personaje de cuento infantil: "${personaje}". Incluye: colores exactos, ropa o características físicas fijas, rasgos distintivos. Máximo 40 palabras. Solo la descripción, sin explicaciones.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();

    // Título y dedicatoria personalizados
    send({ tipo: 'estado', mensaje: '🎂 Escribiendo la historia...' });
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético y emotivo para un cuento de cumpleaños donde el protagonista se llama ${nombre} y cumple ${edad} años. Su personaje especial es ${personaje}. También genera una dedicatoria emotiva de 2-3 frases para ${nombre}. Responde SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    // Portada vertical
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Birthday book cover: ${protagonistaDesc} with ${personajeDesc} surrounded by colorful balloons, confetti, and birthday cake. Festive magical atmosphere. Spanish title: "${tituloData.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536', `cumple_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // 10 spreads horizontales
    for (const sp of SPREADS_CUMPLE) {
      send({ tipo: 'estado', mensaje: `🎨 Generando spread ${sp.spread} de 10...` });

      const textoIzq = sp.pagIzq.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[EDAD\]/g, String(edad));
      const textoDer = sp.pagDer.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[EDAD\]/g, String(edad));

      let imgUrl = '';
      try {
        const prompt = spreadPrompt(estiloBase, protagonistaDesc, personajeDesc, sp.escenaIzq, sp.escenaDer);
        imgUrl = await generarImagen(prompt, '1536x1024', `cumple_${id}_${sp.spread}.png`);
      } catch(e) {
        console.error(`Error spread ${sp.spread}:`, e.message);
      }

      send({
        tipo: 'spread',
        spread: sp.spread,
        url: imgUrl,
        pagIzq: { ...sp.pagIzq, texto: textoIzq },
        pagDer: { ...sp.pagDer, texto: textoDer }
      });
    }

    send({
      tipo: 'completado',
      dedicatoriaPersonal: dedicatoriaPersonal || '',
      nombre,
      fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: SE ME CAYÓ UN DIENTE
// 10 spreads horizontales
// ═════════════════════════════════════════════════════════════
const SPREADS_DIENTE = [
  { spread: 1,
    pagIzq: { numero: 1,  titulo: "El diente que baila",       texto_base: "Hace días que [NOMBRE] nota algo raro. Su diente de delante se mueve un poquito. Lo toca con la lengua una y otra vez. ¡Se mueve de verdad!" },
    pagDer: { numero: 2,  titulo: "¡Qué miedo!",               texto_base: "[NOMBRE] tiene un poco de miedo. ¿Dolerá cuando se caiga? ¿Quedará un hueco feo? [VISITANTE_NOMBRE] le dice que no pasa nada, que a todos les caen los dientes." },
    escenaIzq: "child touching a wobbly tooth with their tongue, looking in bathroom mirror with a funny surprised expression",
    escenaDer:  "child looking worried, reassuring magical friend smiling warmly at them, cozy home setting" },

  { spread: 2,
    pagIzq: { numero: 3,  titulo: "¡Se cae!",                  texto_base: "Al morder una manzana... ¡CRAC! [NOMBRE] se lleva la mano a la boca. ¡El diente se ha caído! Lo mira en la palma de su mano — es pequeñito y brillante." },
    pagDer: { numero: 4,  titulo: "¡Hay un hueco!",            texto_base: "[NOMBRE] corre al espejo. Abre la boca muy grande y... ¡hay un hueco! La lengua no para de meterse ahí. Es rarísimo pero también graciosísimo." },
    escenaIzq: "child biting an apple with a crunch, surprised expression, holding a tiny shiny tooth in their palm",
    escenaDer:  "child opening mouth wide in front of mirror, pointing and laughing at the gap, purely delighted" },

  { spread: 3,
    pagIzq: { numero: 5,  titulo: "La noticia del cole",       texto_base: "Al día siguiente, [NOMBRE] llega al cole con una gran noticia. '¡Se me cayó un diente!', anuncia a sus amigos. Todos quieren ver el hueco. ¡[NOMBRE] es el más famoso de la clase!" },
    pagDer: { numero: 6,  titulo: "El diente más limpio",      texto_base: "En casa, [NOMBRE] lava el diente con mucho cuidado. Con agua, con jabón, con un trapito suave. Tiene que estar perfectamente limpio para esta noche." },
    escenaIzq: "child proudly showing gap tooth to excited classmates in a sunny classroom, everyone leaning in",
    escenaDer:  "child carefully washing a tiny tooth at bathroom sink with great concentration and tenderness" },

  { spread: 4,
    pagIzq: { numero: 7,  titulo: "La cajita especial",        texto_base: "Mamá saca una cajita muy especial. [NOMBRE] pone el diente dentro con mucho cuidado. Esta noche la cajita irá bajo la almohada. ¡El visitante mágico vendrá!" },
    pagDer: { numero: 8,  titulo: "¡Esta noche viene!",        texto_base: "[NOMBRE] se mete en la cama muy emocionado. Pone la cajita bajo la almohada. '¿Y si me quedo despierto para verle?', pregunta. 'Viene solo cuando los niños duermen', dice mamá." },
    escenaIzq: "child placing tiny tooth in a magical decorated small box, parent watching lovingly, warm bedroom lamp",
    escenaDer:  "child lying excitedly in bed peeking under pillow, soft moonlight, stuffed animals watching" },

  { spread: 5,
    pagIzq: { numero: 9,  titulo: "Las estrellas vigilan",     texto_base: "[NOMBRE] intenta dormir pero está muy emocionado. Las estrellas brillan por la ventana. Los ojos se van cerrando poco a poco... hasta que se queda dormido." },
    pagDer: { numero: 10, titulo: "El visitante de medianoche", texto_base: "A medianoche, cuando todo está en silencio, [VISITANTE_NOMBRE] aparece. Se mueve sin hacer ningún ruido. Levanta la almohada con mucho cuidado para no despertar a [NOMBRE]." },
    escenaIzq: "child peacefully falling asleep, stars and moon glowing through bedroom window, dreamlike atmosphere",
    escenaDer:  "magical visitor tiptoeing into moonlit bedroom, lifting pillow with a soft golden magical glow, complete silence" },

  { spread: 6,
    pagIzq: { numero: 11, titulo: "El intercambio mágico",     texto_base: "[VISITANTE_NOMBRE] coge la cajita con el diente y deja en su lugar una moneda que brilla como una estrella. También deja un papelito doblado. Todo con mucho amor y cuidado." },
    pagDer: { numero: 12, titulo: "¡Buenos días!",             texto_base: "Por la mañana, [NOMBRE] se despierta de golpe. ¡La almohada! Mete la mano corriendo y... ¡nota algo diferente! Saca la mano muy despacio..." },
    escenaIzq: "magical visitor carefully replacing box with glowing rainbow coin and tiny folded note, sparkles everywhere",
    escenaDer:  "child waking up suddenly, reaching under pillow with wide hopeful eyes, golden morning sunlight" },

  { spread: 7,
    pagIzq: { numero: 13, titulo: "La moneda mágica",          texto_base: "¡Una moneda que brilla! [NOMBRE] la pone al sol y brilla con todos los colores del arcoíris. '¡Vino de verdad!', grita [NOMBRE] corriendo por la casa." },
    pagDer: { numero: 14, titulo: "El mensaje secreto",        texto_base: "[NOMBRE] también encuentra el papelito. Lo desdobla con cuidado. Dice: 'Tu diente era tan valiente como tú. Cuida bien los nuevos. Con cariño, [VISITANTE_NOMBRE].'" },
    escenaIzq: "child holding magical rainbow-shimmering coin up to sunlight, running joyfully through the house",
    escenaDer:  "child carefully unfolding and reading a tiny magical letter, sparkling eyes, sitting on bed in warm morning light" },

  { spread: 8,
    pagIzq: { numero: 15, titulo: "El hueco tiene nombre",     texto_base: "[NOMBRE] corre al espejo. Abre la boca y mira el hueco. Ya no da miedo. Es la prueba de que está creciendo. 'Mi hueco mágico', dice [NOMBRE] muy orgulloso." },
    pagDer: { numero: 16, titulo: "Enseñando el tesoro",       texto_base: "[NOMBRE] llama a [VISITANTE_NOMBRE] para enseñarle la moneda y el mensaje. [VISITANTE_NOMBRE] sonríe. 'Lo sabía', dice. 'Eres el niño más valiente del mundo.'" },
    escenaIzq: "child smiling proudly at reflection showing gap tooth, confident and happy, morning light",
    escenaDer:  "child showing magical coin and letter to their visitor friend, both smiling warmly, cozy room" },

  { spread: 9,
    pagIzq: { numero: 17, titulo: "La cajita de los recuerdos", texto_base: "Mamá guarda la moneda en una cajita especial. 'Aquí guardaremos todos tus dientes mágicos', dice. [NOMBRE] mira la cajita y piensa que crecer es una aventura maravillosa." },
    pagDer: { numero: 18, titulo: "Contándoselo a todos",       texto_base: "[NOMBRE] no puede parar de contar su historia. Al abuelo, a los vecinos, al gato... A todo el mundo le enseña la moneda y el hueco. Es el mejor cuento del mundo." },
    escenaIzq: "mother and child together putting magical coin in a special keepsake box, tender moment, warm light",
    escenaDer:  "child excitedly telling the story to family members, showing coin, everyone listening with smiles" },

  { spread: 10,
    pagIzq: { numero: 19, titulo: "Crecer es mágico",           texto_base: "Esa tarde, [NOMBRE] mira sus dientes en el espejo. Cuenta cuántos tiene. Sabe que algún día caerán más. Y cada vez, vendrá la magia. Siempre. Sin falta." },
    pagDer: { numero: 20, titulo: "El sueño más bonito",         texto_base: "Por la noche, [NOMBRE] se duerme sonriendo. El hueco es como una medalla. 'Soy valiente, estoy creciendo y la magia existe de verdad', susurra antes de soñar." },
    escenaIzq: "child looking in mirror counting teeth with wonder and excitement, magical glow around smile",
    escenaDer:  "child sleeping peacefully with happy smile, magical coin glowing on bedside table, stars through window" }
];

app.post('/generar-diente', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, visitanteId, visitanteNombre, visitanteDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero            = opciones?.genero   || 'niño';
    const piel              = opciones?.piel     || 'light, fair skin';
    const pelo              = opciones?.pelo     || 'brown';
    const tipopelo          = opciones?.tipopelo || 'straight';
    const ojos              = opciones?.ojos     || 'brown';
    const gafas             = opciones?.gafas    || 'without glasses';
    const pecas             = opciones?.pecas    || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;
    const protagonistaDesc  = `a ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    send({ tipo: 'estado', mensaje: '🦷 Preparando la historia del diente...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // Título y dedicatoria
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético y emotivo para un cuento infantil sobre el momento en que a ${nombre} se le cae su primer diente y viene ${visitanteNombre} a recogerlo. Genera también una dedicatoria emotiva de 2-3 frases para ${nombre}. Responde SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    // Portada vertical
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} holding a tiny glowing tooth, with ${visitanteDesc} appearing magically nearby with sparkles and stars. Nighttime magical atmosphere. Spanish title: "${tituloData.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536', `diente_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // 10 spreads horizontales
    for (const sp of SPREADS_DIENTE) {
      send({ tipo: 'estado', mensaje: `🎨 Generando spread ${sp.spread} de 10...` });

      const textoIzq = sp.pagIzq.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[VISITANTE_NOMBRE\]/g, visitanteNombre);
      const textoDer = sp.pagDer.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[VISITANTE_NOMBRE\]/g, visitanteNombre);

      let imgUrl = '';
      try {
        const escenaIzq = sp.escenaIzq.replace(/\[VISITANTE_DESC\]/g, visitanteDesc);
        const escenaDer = sp.escenaDer.replace(/\[VISITANTE_DESC\]/g, visitanteDesc);
        const prompt = spreadPrompt(estiloBase, protagonistaDesc, visitanteDesc, escenaIzq, escenaDer);
        imgUrl = await generarImagen(prompt, '1536x1024', `diente_${id}_${sp.spread}.png`);
      } catch(e) {
        console.error(`Error spread ${sp.spread}:`, e.message);
      }

      send({
        tipo: 'spread',
        spread: sp.spread,
        url: imgUrl,
        pagIzq: { ...sp.pagIzq, texto: textoIzq },
        pagDer: { ...sp.pagDer, texto: textoDer }
      });
    }

    send({
      tipo: 'completado',
      dedicatoriaPersonal: dedicatoriaPersonal || '',
      nombre,
      fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: VACACIONES DE VERANO
// 10 spreads horizontales
// ═════════════════════════════════════════════════════════════
const SPREADS_VERANO = [
  { spread: 1,
    pagIzq: { numero: 1,  titulo: "¡Por fin vacaciones!",      texto_base: "Suena el timbre por última vez. [NOMBRE] sale corriendo del cole con los brazos en alto. ¡Han llegado las vacaciones! [PERSONAJE] le espera en la puerta con una gran sonrisa." },
    pagDer: { numero: 2,  titulo: "Haciendo las maletas",      texto_base: "En casa, [NOMBRE] y [PERSONAJE] hacen las maletas juntos. [NOMBRE] mete el bañador, las gafas de sol y su juguete favorito. ¡Que no falte nada para la gran aventura!" },
    escenaIzq: "child running out of school on last day, arms raised in celebration, bright sunny summer day",
    escenaDer:  "child and companion happily packing a colorful suitcase together in a bright summer bedroom" },

  { spread: 2,
    pagIzq: { numero: 3,  titulo: "El viaje",                  texto_base: "En el coche, [NOMBRE] y [PERSONAJE] cantan canciones y juegan. El paisaje va cambiando por la ventana. '¡Ya casi llegamos!', dice papá." },
    pagDer: { numero: 4,  titulo: "¡El primer vistazo!",       texto_base: "De repente, [NOMBRE] ve [DESTINO] por primera vez. Se le abren los ojos como platos. '¡WOW!', grita tan fuerte que todos se ríen. [PERSONAJE] le da un abrazo enorme." },
    escenaIzq: "child and companion looking excitedly out of car window during road trip, singing and playing",
    escenaDer:  "child seeing [DESTINO_DESC] for the first time, eyes wide with amazement, being hugged by companion" },

  { spread: 3,
    pagIzq: { numero: 5,  titulo: "La primera aventura",       texto_base: "Sin perder un minuto, [NOMBRE] y [PERSONAJE] se lanzan a explorar. Corren, saltan y descubren cada rincón. ¡El verano ha empezado de verdad!" },
    pagDer: { numero: 6,  titulo: "El helado más grande",      texto_base: "Después de tanto correr, [NOMBRE] pide el helado más grande que ha visto en su vida. Tres bolas de colores que casi no puede sujetar. [PERSONAJE] le ayuda antes de que caiga." },
    escenaIzq: "child and companion running and exploring [DESTINO_DESC] with pure joy and energy",
    escenaDer:  "child holding giant colorful three-scoop ice cream about to topple, companion catching it, both laughing" },

  { spread: 4,
    pagIzq: { numero: 7,  titulo: "Un momento de susto",       texto_base: "De repente, algo inesperado asusta a [NOMBRE]. El corazón le late muy fuerte. Pero [PERSONAJE] está ahí. 'No pasa nada', dice [PERSONAJE]. Y [NOMBRE] respira y se siente valiente." },
    pagDer: { numero: 8,  titulo: "El atardecer mágico",       texto_base: "Por la tarde, [NOMBRE] y [PERSONAJE] se sientan juntos a ver el atardecer. El cielo se pinta de naranja, rosa y morado. 'Es el más bonito del mundo', susurra [NOMBRE]." },
    escenaIzq: "child looking momentarily scared, companion reassuring them with a warm hand on shoulder, [DESTINO_DESC]",
    escenaDer:  "child and companion sitting together watching a spectacular sunset, sky in orange pink purple, golden hour" },

  { spread: 5,
    pagIzq: { numero: 9,  titulo: "Noche de estrellas",        texto_base: "Por la noche, [NOMBRE] y [PERSONAJE] buscan constelaciones en el cielo. [PERSONAJE] señala la Osa Mayor. [NOMBRE] cierra un ojo y la sigue con el dedo. '¡La veo, la veo!'" },
    pagDer: { numero: 10, titulo: "El día de lluvia",          texto_base: "Un día llueve y no se puede salir. ¡Pero [NOMBRE] y [PERSONAJE] inventan los juegos más divertidos del mundo! Construyen una cabaña con mantas y juegan hasta cansarse." },
    escenaIzq: "child and companion lying on grass looking at spectacular starry night sky, pointing at constellations",
    escenaDer:  "cozy blanket fort inside with rainy window visible, flashlight, board games, warm and fun atmosphere" },

  { spread: 6,
    pagIzq: { numero: 11, titulo: "El tesoro escondido",       texto_base: "[NOMBRE] y [PERSONAJE] deciden buscar tesoros. Con un palito, dibujan un mapa. Después de mucho buscar... ¡encuentran algo brillante! Es pequeño pero perfecto para guardar como recuerdo." },
    pagDer: { numero: 12, titulo: "Una tarde en familia",      texto_base: "Una tarde, toda la familia se reúne. Comen juntos, ríen y cuentan historias. [NOMBRE] mira a su alrededor y piensa que este es el mejor momento del verano." },
    escenaIzq: "child and companion on a treasure hunt at [DESTINO_DESC], finding something small and shiny, excited",
    escenaDer:  "happy family gathering outdoors eating together, golden afternoon light, child looking around gratefully" },

  { spread: 7,
    pagIzq: { numero: 13, titulo: "La noche más mágica",       texto_base: "La última noche, el cielo se llena de luces de colores. [NOMBRE] y [PERSONAJE] los miran con la boca abierta. Luego [NOMBRE] pide un deseo secreto." },
    pagDer: { numero: 14, titulo: "El último día",             texto_base: "Ha llegado el último día. [NOMBRE] quiere guardarlo todo en la memoria. Hace una foto con [PERSONAJE] en su rincón favorito. '¡Hasta el año que viene!', dice [NOMBRE]." },
    escenaIzq: "spectacular fireworks lighting up the night sky at [DESTINO_DESC], child and companion watching in awe",
    escenaDer:  "child and companion taking a final photo at favorite spot, bittersweet smiles, golden summer light" },

  { spread: 8,
    pagIzq: { numero: 15, titulo: "El viaje de vuelta",        texto_base: "En el coche de regreso, [NOMBRE] va callado mirando por la ventana. Piensa en todo lo vivido. [PERSONAJE] le aprieta la mano. 'Ha sido el mejor verano', dice [NOMBRE] sonriendo." },
    pagDer: { numero: 16, titulo: "Los recuerdos en el bolsillo", texto_base: "[NOMBRE] saca el pequeño tesoro que encontraron. Lo aprieta en su mano. Todos los recuerdos del verano caben en ese momento: las risas, el sol, el mar y [PERSONAJE]." },
    escenaIzq: "child looking pensively out of car window on the way home, companion holding their hand, warm afternoon",
    escenaDer:  "child holding summer treasure in hand, memories swirling around in a magical golden glow" },

  { spread: 9,
    pagIzq: { numero: 17, titulo: "De vuelta en casa",         texto_base: "Al llegar a casa, [NOMBRE] corre a su habitación. Todo está igual, pero [NOMBRE] es diferente. Ha vivido una gran aventura y ha vuelto más valiente." },
    pagDer: { numero: 18, titulo: "El diario del verano",      texto_base: "[NOMBRE] saca un cuaderno y empieza a dibujar. El helado, las estrellas, el atardecer... [PERSONAJE] mira por encima del hombro. 'No te olvides del tesoro', dice sonriendo." },
    escenaIzq: "child arriving home and running to their room with summer energy, home feeling familiar yet different",
    escenaDer:  "child drawing summer memories in a notebook, companion watching lovingly from behind, cozy afternoon light" },

  { spread: 10,
    pagIzq: { numero: 19, titulo: "Hasta el próximo verano",   texto_base: "[NOMBRE] y [PERSONAJE] se sientan juntos a ver las fotos. Cada una es un recuerdo que nadie puede quitarles. 'El próximo verano será aún mejor', dice [PERSONAJE]." },
    pagDer: { numero: 20, titulo: "El verano en el corazón",   texto_base: "Por la noche, [NOMBRE] se duerme sonriendo. El verano ya vive para siempre en su corazón. Y mientras duerme, sueña con la próxima gran aventura." },
    escenaIzq: "child and companion looking at summer photos together, warm smiles, cozy home atmosphere",
    escenaDer:  "child sleeping peacefully with a happy smile, summer souvenir glowing on bedside table, moonlight through window" }
];

app.post('/generar-verano', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, personaje, destinoId, destinoNombre, destinoDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero            = opciones?.genero   || 'niño';
    const piel              = opciones?.piel     || 'light, fair skin';
    const pelo              = opciones?.pelo     || 'brown';
    const tipopelo          = opciones?.tipopelo || 'straight';
    const ojos              = opciones?.ojos     || 'brown';
    const gafas             = opciones?.gafas    || 'without glasses';
    const pecas             = opciones?.pecas    || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm summer lighting`;
    const protagonistaDesc  = `a ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, wearing a summer outfit`;

    send({ tipo: 'estado', mensaje: '☀️ Preparando la aventura de verano...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // Descripción visual fija del compañero
    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera una descripción visual detallada y consistente en inglés para este personaje de cuento infantil: "${personaje}". Incluye colores exactos, características físicas fijas, rasgos distintivos. Máximo 40 palabras. Solo la descripción.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();

    // Título y dedicatoria
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético para un cuento de verano donde ${nombre} vive aventuras increíbles en ${destinoNombre} con ${personaje}. También una dedicatoria emotiva de 2-3 frases. SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    // Portada vertical
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} with ${personajeDesc} having fun at ${destinoNombre}, ${destinoDesc}. Bright summer colors, joyful and adventurous atmosphere. Spanish title: "${tituloData.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536', `verano_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // 10 spreads horizontales
    for (const sp of SPREADS_VERANO) {
      send({ tipo: 'estado', mensaje: `🎨 Generando spread ${sp.spread} de 10...` });

      const textoIzq = sp.pagIzq.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[DESTINO\]/g, destinoNombre);
      const textoDer = sp.pagDer.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[DESTINO\]/g, destinoNombre);

      const escenaIzq = sp.escenaIzq
        .replace(/\[DESTINO_DESC\]/g, destinoDesc)
        .replace(/\[DESTINO\]/g, destinoNombre);
      const escenaDer = sp.escenaDer
        .replace(/\[DESTINO_DESC\]/g, destinoDesc)
        .replace(/\[DESTINO\]/g, destinoNombre);

      let imgUrl = '';
      try {
        const prompt = spreadPrompt(estiloBase, protagonistaDesc, personajeDesc, escenaIzq, escenaDer);
        imgUrl = await generarImagen(prompt, '1536x1024', `verano_${id}_${sp.spread}.png`);
      } catch(e) {
        console.error(`Error spread ${sp.spread}:`, e.message);
      }

      send({
        tipo: 'spread',
        spread: sp.spread,
        url: imgUrl,
        pagIzq: { ...sp.pagIzq, texto: textoIzq },
        pagDer: { ...sp.pagDer, texto: textoDer }
      });
    }

    send({
      tipo: 'completado',
      dedicatoriaPersonal: dedicatoriaPersonal || '',
      nombre,
      fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});

app.listen(3000, () => console.log('🦉 StoryOwl corriendo en http://localhost:3000'));
