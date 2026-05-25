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
// Siempre portrait 1024x1536 — una imagen por página
// ─────────────────────────────────────────────────────────────
async function generarImagen(prompt, nombreArchivo) {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1024x1536', quality: 'low', n: 1 })
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
// CHARACTER BIBLE — descripción fija exhaustiva del protagonista
// Garantiza identidad visual consistente en TODAS las páginas.
// ─────────────────────────────────────────────────────────────
function buildProtagonistaBible(nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas, ropa) {
  const hairDesc  = `${tipopelo} ${pelo} hair — exact same length, volume and style in every image`;
  const eyeDesc   = `${ojos} eyes — same size, shape and color in every image`;
  const skinDesc  = `${piel} skin tone — unchanged across all images`;
  const glassDesc = (gafas && gafas !== 'without glasses') ? `, ${gafas} — always present, same frame` : ', no glasses';
  const freckDesc = pecas ? `, ${pecas} — always visible on nose` : '';
  const ropaDesc  = ropa || 'bright yellow t-shirt and blue denim dungarees/overalls — same outfit every page';
  return (
    `PROTAGONIST (must look IDENTICAL in every single illustration — same child, same face, same body): ` +
    `${edad}-year-old ${genero} named ${nombre}. ` +
    `Hair: ${hairDesc}. Eyes: ${eyeDesc}. Skin: ${skinDesc}${glassDesc}${freckDesc}. ` +
    `Outfit: ${ropaDesc}. ` +
    `Same face proportions, same apparent age, same body size in every image. ` +
    `NEVER change any physical feature between illustrations.`
  );
}

// ─────────────────────────────────────────────────────────────
// CHARACTER BIBLE — personaje secundario
// ─────────────────────────────────────────────────────────────
function buildPersonajeBible(nombre, desc) {
  return (
    `COMPANION CHARACTER (must look IDENTICAL in every single illustration): ` +
    `${nombre}. Fixed visual description: ${desc}. ` +
    `Same design, same colors, same proportions in every image. Do NOT reinvent this character.`
  );
}

// ─────────────────────────────────────────────────────────────
// PROMPT de página — character bible completo en cada llamada
// ─────────────────────────────────────────────────────────────
function paginaPrompt(estiloBase, protagonistaBible, personajeBible, escena) {
  return (
    `${estiloBase}. Portrait format children's book illustration. ` +
    `${protagonistaBible} ` +
    `${personajeBible} ` +
    `Scene: ${escena}. ` +
    `Warm lighting, rich colors, professional children's book quality.`
  );
}


// ═════════════════════════════════════════════════════════════
// RUTA: /generar-cuento  (cuento libre personalizado)
// 16 páginas verticales individuales
// ═════════════════════════════════════════════════════════════
app.post('/generar-cuento', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, tema, personaje, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero            = opciones?.genero   || 'protagonista';
    const piel              = opciones?.piel     || 'light, fair skin';
    const pelo              = opciones?.pelo     || 'brown';
    const tipopelo          = opciones?.tipopelo || 'straight';
    const ojos              = opciones?.ojos     || 'brown';
    const gafas             = opciones?.gafas    || 'without glasses';
    const pecas             = opciones?.pecas    || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm lighting`;
    const protagonistaBible = buildProtagonistaBible(nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas);

    const tonoEdad = edad <= 5  ? 'muy sencillo, frases cortas, vocabulario básico, máximo 2 frases por página' :
                     edad <= 8  ? 'sencillo, frases cortas, aventuras y humor, 3-4 frases por página' :
                     edad <= 11 ? 'intermedio, algo de misterio y emoción, 4-5 frases por página' :
                                  'avanzado, trama elaborada, 5-6 frases por página';

    send({ tipo: 'estado', mensaje: '🦉 El búho está creando los personajes...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // PASO 1: Descripción visual exhaustiva del personaje secundario
    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 400,
      messages: [{ role: 'user', content: `Genera una descripción visual MUY detallada y específica en inglés para este personaje de cuento infantil: "${personaje}". Incluye: colores EXACTOS (no aproximados), ropa con detalles, forma exacta de ojos/cara/cuerpo, rasgos únicos y distintivos, proporciones. La descripción debe ser tan precisa que el personaje quede IDÉNTICO en todas las ilustraciones. Máximo 60 palabras. Solo la descripción, sin explicaciones.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();
    const personajeBible = buildPersonajeBible(personaje, personajeDesc);

    send({ tipo: 'estado', mensaje: '🦉 El búho está escribiendo el cuento...' });

    // PASO 2: Claude genera el cuento — exactamente 16 páginas
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 5000,
      messages: [{ role: 'user', content: `Eres autor experto de cuentos infantiles en español.
Crea un cuento mágico con estas características:
- Protagonista: ${nombre}, ${edad} años, ${genero}
- Personaje especial: ${personaje}
- Tema: ${tema}
- Tono y nivel: ${tonoEdad}

El cuento tiene exactamente 16 páginas con estructura completa: introducción (1-3), desarrollo (4-12), clímax (13-14), desenlace (15-16).
Cada página: una idea principal, poco texto, ritmo rápido. Ideal para leer antes de dormir.

RESPONDE SOLO JSON sin texto antes ni después, sin backticks:
{"titulo":"titulo poetico","dedicatoria":"dedicatoria emotiva para ${nombre}","paginas":[
{"numero":1,"titulo":"titulo pagina","texto":"texto corto adaptado a la edad","escena":"detailed scene in English for image generation"},
{"numero":2,"titulo":"...","texto":"...","escena":"..."},
{"numero":3,"titulo":"...","texto":"...","escena":"..."},
{"numero":4,"titulo":"...","texto":"...","escena":"..."},
{"numero":5,"titulo":"...","texto":"...","escena":"..."},
{"numero":6,"titulo":"...","texto":"...","escena":"..."},
{"numero":7,"titulo":"...","texto":"...","escena":"..."},
{"numero":8,"titulo":"...","texto":"...","escena":"..."},
{"numero":9,"titulo":"...","texto":"...","escena":"..."},
{"numero":10,"titulo":"...","texto":"...","escena":"..."},
{"numero":11,"titulo":"...","texto":"...","escena":"..."},
{"numero":12,"titulo":"...","texto":"...","escena":"..."},
{"numero":13,"titulo":"...","texto":"...","escena":"..."},
{"numero":14,"titulo":"...","texto":"...","escena":"..."},
{"numero":15,"titulo":"...","texto":"...","escena":"..."},
{"numero":16,"titulo":"...","texto":"...","escena":"..."}
]}` }]
    });

    const text  = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON encontrado en respuesta de Claude');
    const cuento = JSON.parse(match[0]);

    send({ tipo: 'cuento', titulo: cuento.titulo, dedicatoria: cuento.dedicatoria });

    // PASO 3: Portada vertical
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover portrait format. ${protagonistaBible} ${personajeBible} Magical glowing scene, epic adventure mood. Spanish title: "${cuento.titulo}". Professional children's book cover.`,
        `portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // PASO 4: 16 páginas verticales individuales
    for (const pag of cuento.paginas) {
      send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          paginaPrompt(estiloBase, protagonistaBible, personajeBible, pag.escena),
          `pag_${id}_${pag.numero}.png`
        );
      } catch(e) {
        console.error(`Error página ${pag.numero}:`, e.message);
      }
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto: pag.texto, url: imgUrl });
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: CUENTO DE CUMPLEAÑOS — 16 páginas individuales
// ═════════════════════════════════════════════════════════════
const PAGINAS_CUMPLE = [
  { numero:1,  titulo:"El gran día ha llegado",     texto_base:"[NOMBRE] se despierta con una sonrisa enorme. ¡Hoy es su cumpleaños! Se levanta de un salto y corre a la ventana — el sol brilla especialmente para [NOMBRE] hoy.",
    escena:"child waking up joyfully in a birthday-decorated bedroom, colorful balloons, morning sunlight streaming in" },
  { numero:2,  titulo:"Nadie lo recuerda",           texto_base:"En el cole, [NOMBRE] espera que alguien le diga algo... pero sus amigos hablan de otras cosas. La maestra tampoco dice nada. ¡Qué raro!",
    escena:"child sitting sadly in a sunny classroom while friends chat among themselves, looking a bit forgotten" },
  { numero:3,  titulo:"Un día muy largo",            texto_base:"Las horas pasan lentas. [NOMBRE] mira el reloj una y otra vez. Al final suena el timbre. Con los hombros caídos, sale del cole.",
    escena:"child watching the clock in classroom, shoulders drooping, afternoon light, last bell ringing" },
  { numero:4,  titulo:"¡Aparece el amigo especial!", texto_base:"De repente, [PERSONAJE] aparece en la esquina con una enorme sonrisa. ¡Le estaba esperando! '¡Ven conmigo!', dice misteriosamente.",
    escena:"magical friend character appearing cheerfully at a colorful street corner with sparkles and a big smile" },
  { numero:5,  titulo:"El camino a casa",            texto_base:"[PERSONAJE] lleva a [NOMBRE] de vuelta a casa. Por el camino no para de sonreír. '¿Qué pasa?', pregunta [NOMBRE]. '¡Ya verás!', responde.",
    escena:"child and magical friend walking home on a colorful street, friend smiling secretively and winking" },
  { numero:6,  titulo:"¡SORPRESA!",                  texto_base:"[NOMBRE] abre la puerta y... ¡SORPRESA! Todos sus amigos y familiares saltan de detrás de los muebles. ¡Nadie había olvidado el cumpleaños!",
    escena:"explosion of colorful balloons and confetti as door opens, surprised happy faces jumping out" },
  { numero:7,  titulo:"Lágrimas de alegría",         texto_base:"[NOMBRE] se queda con la boca abierta. Los ojos se le llenan de lágrimas de felicidad. [PERSONAJE] le da un abrazo enorme.",
    escena:"child with tears of joy, being hugged by magical friend, warm golden light, cozy living room" },
  { numero:8,  titulo:"¡Empieza la fiesta!",         texto_base:"¡La música empieza a sonar! El salón está decorado con sus colores favoritos. Globos, serpentinas y carteles por todas partes.",
    escena:"spectacular birthday party in full swing, music notes floating, colorful decorations, everyone dancing" },
  { numero:9,  titulo:"Los juegos locos",            texto_base:"¡Llegan los juegos! [PERSONAJE] organiza una carrera de sacos que acaba con todos rodando por el suelo de risa. ¡[NOMBRE] gana!",
    escena:"children playing sack race games, everyone laughing and falling, colorful garden party atmosphere" },
  { numero:10, titulo:"La canción más especial",     texto_base:"De repente, la música para. Todos se colocan en círculo y empiezan a cantar '¡Cumpleaños Feliz!' a todo pulmón.",
    escena:"everyone singing in a circle around the glowing child, candlelight warmth, hands joined" },
  { numero:11, titulo:"La tarta mágica",             texto_base:"[PERSONAJE] trae la tarta más impresionante que [NOMBRE] ha visto jamás. Tiene [EDAD] velas encendidas que brillan como estrellas.",
    escena:"spectacular birthday cake with glowing candles being carried in, amazed faces lit by candlelight" },
  { numero:12, titulo:"El deseo secreto",            texto_base:"[NOMBRE] cierra los ojos con fuerza y piensa en su deseo más especial. El silencio llena la habitación. Todos esperan.",
    escena:"child closing eyes tightly making a wish, magical sparkles swirling, everyone watching in hopeful silence" },
  { numero:13, titulo:"¡A soplar!",                  texto_base:"[NOMBRE] coge aire... y ¡SOPLA! Las [EDAD] velas se apagan de golpe. ¡Todos aplauden y gritan de alegría!",
    escena:"child blowing out all candles, smoke curling up, confetti raining, everyone cheering with pure joy" },
  { numero:14, titulo:"Los regalos",                 texto_base:"[PERSONAJE] entrega a [NOMBRE] un paquete envuelto en papel dorado. Dentro hay exactamente lo que había deseado.",
    escena:"child opening a beautiful golden wrapped present with magical friend watching lovingly" },
  { numero:15, titulo:"Contando las estrellas",      texto_base:"Esa noche, [NOMBRE] y [PERSONAJE] salen al jardín a contar estrellas. 'Una por cada momento feliz de hoy', dice [PERSONAJE].",
    escena:"child and magical friend lying on grass counting stars, magical night sky full of glowing constellations" },
  { numero:16, titulo:"El mejor cumpleaños",         texto_base:"En la cama, [NOMBRE] sonríe en la oscuridad. Ha sido el mejor cumpleaños del mundo. 'Gracias, [PERSONAJE]', susurra antes de dormir.",
    escena:"child sleeping peacefully with happy smile, birthday decorations visible, one star shining bright through window" }
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
    const protagonistaBible = buildProtagonistaBible(nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas);

    send({ tipo: 'estado', mensaje: '🎂 Creando los personajes de la fiesta...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 400,
      messages: [{ role: 'user', content: `Genera una descripción visual MUY detallada y específica en inglés para este personaje de cuento infantil: "${personaje}". Incluye colores EXACTOS, ropa con detalles, forma exacta de cara/ojos/cuerpo, rasgos únicos. La descripción debe ser tan precisa que el personaje quede IDÉNTICO en todas las ilustraciones. Máximo 60 palabras. Solo la descripción.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();
    const personajeBible = buildPersonajeBible(personaje, personajeDesc);

    send({ tipo: 'estado', mensaje: '🎂 Escribiendo la historia...' });
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético para un cuento de cumpleaños donde ${nombre} cumple ${edad} años y su personaje especial es ${personaje}. También una dedicatoria emotiva de 2-3 frases. SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Birthday book cover portrait. ${protagonistaBible} ${personajeBible} Surrounded by colorful balloons and confetti, festive magical atmosphere. Spanish title: "${tituloData.titulo}".`,
        `cumple_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) { send({ tipo: 'imagen', url: '' }); }

    for (const pag of PAGINAS_CUMPLE) {
      send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });
      const texto = pag.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[EDAD\]/g, String(edad));
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          paginaPrompt(estiloBase, protagonistaBible, personajeBible, pag.escena),
          `cumple_${id}_${pag.numero}.png`
        );
      } catch(e) { console.error(`Error pág ${pag.numero}:`, e.message); }
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) });
    res.end();
  } catch(err) { send({ tipo: 'error', mensaje: err.message }); res.end(); }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: SE ME CAYÓ UN DIENTE — 16 páginas individuales
// ═════════════════════════════════════════════════════════════
const PAGINAS_DIENTE = [
  { numero:1,  titulo:"El diente que baila",         texto_base:"Hace días que [NOMBRE] nota algo raro. Su diente de delante se mueve un poquito. Lo toca con la lengua una y otra vez. ¡Se mueve de verdad!",
    escena:"child touching a wobbly tooth with their tongue, looking in bathroom mirror with a funny surprised expression" },
  { numero:2,  titulo:"¡Qué miedo!",                 texto_base:"[NOMBRE] tiene un poco de miedo. ¿Dolerá cuando se caiga? [VISITANTE_NOMBRE] le dice que no pasa nada, que a todos les caen los dientes.",
    escena:"child looking worried about their tooth, reassuring magical friend smiling warmly nearby" },
  { numero:3,  titulo:"¡Se cae!",                    texto_base:"Al morder una manzana... ¡CRAC! [NOMBRE] se lleva la mano a la boca. ¡El diente se ha caído! Lo mira en la palma — es pequeñito y brillante.",
    escena:"child biting an apple, surprised expression, holding a tiny shiny tooth in their palm, eyes wide" },
  { numero:4,  titulo:"¡Hay un hueco!",              texto_base:"[NOMBRE] corre al espejo. Abre la boca muy grande y... ¡hay un hueco! La lengua no para de meterse ahí. ¡Qué gracioso!",
    escena:"child opening mouth wide in front of mirror, pointing and laughing at the gap with delight" },
  { numero:5,  titulo:"La noticia del cole",         texto_base:"Al día siguiente, [NOMBRE] llega al cole con una gran noticia. '¡Se me cayó un diente!', anuncia. Todos quieren ver el hueco.",
    escena:"child proudly showing gap tooth to excited classmates in a sunny classroom, everyone leaning in curious" },
  { numero:6,  titulo:"El diente más limpio",        texto_base:"En casa, [NOMBRE] lava el diente con mucho cuidado. Con agua y jabón. Tiene que estar perfectamente limpio para esta noche.",
    escena:"child carefully washing a tiny tooth at bathroom sink with great concentration and tenderness" },
  { numero:7,  titulo:"La cajita especial",          texto_base:"Mamá saca una cajita muy especial. [NOMBRE] pone el diente dentro con cuidado. Esta noche la cajita irá bajo la almohada.",
    escena:"child placing tiny tooth in a magical decorated small box, parent watching lovingly, warm bedroom lamp light" },
  { numero:8,  titulo:"¡Esta noche viene!",          texto_base:"[NOMBRE] se mete en la cama muy emocionado. Pone la cajita bajo la almohada. '¿Y si me quedo despierto para verle?', pregunta.",
    escena:"child lying excitedly in bed peeking under pillow, soft moonlight, stuffed animals watching" },
  { numero:9,  titulo:"Las estrellas vigilan",       texto_base:"[NOMBRE] intenta dormir pero está muy emocionado. Las estrellas brillan por la ventana. Los ojos se van cerrando poco a poco...",
    escena:"child peacefully falling asleep, stars and moon glowing through bedroom window, dreamlike atmosphere" },
  { numero:10, titulo:"El visitante de medianoche",  texto_base:"A medianoche, cuando todo está en silencio, [VISITANTE_NOMBRE] aparece. Se mueve sin hacer ningún ruido. Todo brilla un poquito.",
    escena:"magical visitor tiptoeing into moonlit bedroom, soft golden magical glow, complete peaceful silence" },
  { numero:11, titulo:"El intercambio mágico",       texto_base:"[VISITANTE_NOMBRE] coge la cajita con el diente y deja una moneda que brilla como una estrella. También deja un papelito doblado.",
    escena:"magical visitor carefully replacing box with a glowing rainbow coin and tiny folded note, sparkles everywhere" },
  { numero:12, titulo:"¡Buenos días!",               texto_base:"Por la mañana, [NOMBRE] se despierta de golpe. ¡La almohada! Mete la mano corriendo y... ¡nota algo diferente!",
    escena:"child waking up suddenly, reaching under pillow with wide hopeful eyes, golden morning sunlight" },
  { numero:13, titulo:"La moneda mágica",            texto_base:"¡Una moneda que brilla! [NOMBRE] la pone al sol y brilla con todos los colores del arcoíris. '¡Vino de verdad!', grita.",
    escena:"child holding magical rainbow-shimmering coin up to sunlight, running joyfully through the house" },
  { numero:14, titulo:"El mensaje secreto",          texto_base:"[NOMBRE] también encuentra el papelito. Lo desdobla con cuidado. Dice: 'Tu diente era tan valiente como tú. Cuida bien los nuevos.'",
    escena:"child carefully reading a tiny magical letter, sparkling eyes, sitting on bed in warm morning light" },
  { numero:15, titulo:"El hueco tiene nombre",       texto_base:"[NOMBRE] corre al espejo. Abre la boca y mira el hueco. Ya no da miedo. Es la prueba de que está creciendo. '¡Mi hueco mágico!'",
    escena:"child smiling proudly at reflection showing gap tooth, confident and happy, warm morning light" },
  { numero:16, titulo:"Crecer es mágico",            texto_base:"Esa noche, [NOMBRE] se duerme sonriendo. El hueco es como una medalla: 'Soy valiente, estoy creciendo y la magia existe de verdad.'",
    escena:"child sleeping peacefully with happy smile, magical coin glowing on bedside table, stars through window" }
];

app.post('/generar-diente', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, visitanteNombre, visitanteDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
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
    const protagonistaBible = buildProtagonistaBible(nombre, null, genero, piel, pelo, tipopelo, ojos, gafas, pecas);
    const visitanteBible = buildPersonajeBible(visitanteNombre, visitanteDesc);

    send({ tipo: 'estado', mensaje: '🦷 Preparando la historia del diente...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético para un cuento sobre el momento en que a ${nombre} se le cae su primer diente y viene ${visitanteNombre} a recogerlo. También una dedicatoria emotiva de 2-3 frases. SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover portrait. ${protagonistaBible} ${visitanteBible} Child holding a tiny glowing tooth, magical visitor appearing nearby with sparkles. Nighttime magical atmosphere. Spanish title: "${tituloData.titulo}".`,
        `diente_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) { send({ tipo: 'imagen', url: '' }); }

    for (const pag of PAGINAS_DIENTE) {
      send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });
      const texto = pag.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[VISITANTE_NOMBRE\]/g, visitanteNombre);
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          paginaPrompt(estiloBase, protagonistaBible, visitanteBible, pag.escena),
          `diente_${id}_${pag.numero}.png`
        );
      } catch(e) { console.error(`Error pág ${pag.numero}:`, e.message); }
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) });
    res.end();
  } catch(err) { send({ tipo: 'error', mensaje: err.message }); res.end(); }
});


// ═════════════════════════════════════════════════════════════
// COLECCIÓN: VACACIONES DE VERANO — 16 páginas individuales
// ═════════════════════════════════════════════════════════════
const PAGINAS_VERANO = [
  { numero:1,  titulo:"¡Por fin vacaciones!",        texto_base:"Suena el timbre por última vez. [NOMBRE] sale corriendo del cole con los brazos en alto. ¡Han llegado las vacaciones! [PERSONAJE] le espera en la puerta.",
    escena:"child running out of school on last day, arms raised in celebration, bright sunny summer day, companion waiting" },
  { numero:2,  titulo:"Haciendo las maletas",        texto_base:"En casa, [NOMBRE] y [PERSONAJE] hacen las maletas juntos. Mete el bañador, las gafas de sol y su juguete favorito. ¡Que no falte nada!",
    escena:"child and companion happily packing a colorful suitcase together in a bright summer bedroom" },
  { numero:3,  titulo:"El viaje",                    texto_base:"En el coche, [NOMBRE] y [PERSONAJE] cantan canciones y juegan. El paisaje va cambiando por la ventana. '¡Ya casi llegamos!'",
    escena:"child and companion looking excitedly out of car window during road trip, singing and playing together" },
  { numero:4,  titulo:"¡El primer vistazo!",         texto_base:"De repente, [NOMBRE] ve [DESTINO] por primera vez. Se le abren los ojos como platos. '¡WOW!', grita. [PERSONAJE] le da un abrazo.",
    escena:"child seeing amazing destination for first time, eyes wide with amazement, being hugged by companion" },
  { numero:5,  titulo:"La primera aventura",         texto_base:"Sin perder un minuto, [NOMBRE] y [PERSONAJE] se lanzan a explorar. Corren, saltan y descubren cada rincón. ¡El verano ha empezado!",
    escena:"child and companion running and exploring summer destination with pure joy and energy" },
  { numero:6,  titulo:"El helado más grande",        texto_base:"Después de tanto correr, [NOMBRE] pide el helado más grande que ha visto. Tres bolas de colores que casi no puede sujetar.",
    escena:"child holding giant colorful three-scoop ice cream about to topple, companion catching it, both laughing" },
  { numero:7,  titulo:"Un momento de susto",         texto_base:"De repente, algo inesperado asusta a [NOMBRE]. Pero [PERSONAJE] está ahí. 'No pasa nada', dice. Y [NOMBRE] se siente valiente.",
    escena:"child looking momentarily scared, companion reassuring with a warm hand on shoulder, summer setting" },
  { numero:8,  titulo:"El atardecer mágico",         texto_base:"Por la tarde, [NOMBRE] y [PERSONAJE] se sientan juntos a ver el atardecer. El cielo se pinta de naranja, rosa y morado.",
    escena:"child and companion sitting together watching a spectacular sunset, sky in orange pink purple, golden hour" },
  { numero:9,  titulo:"Noche de estrellas",          texto_base:"Por la noche buscan constelaciones. [PERSONAJE] señala la Osa Mayor. [NOMBRE] cierra un ojo y la sigue con el dedo. '¡La veo!'",
    escena:"child and companion lying on grass looking at spectacular starry night sky, pointing at constellations" },
  { numero:10, titulo:"El día de lluvia",            texto_base:"Un día llueve y no se puede salir. ¡Pero [NOMBRE] y [PERSONAJE] inventan los juegos más divertidos! Construyen una cabaña con mantas.",
    escena:"cozy blanket fort inside with rainy window visible, flashlight, board games, warm and fun atmosphere" },
  { numero:11, titulo:"El tesoro escondido",         texto_base:"[NOMBRE] y [PERSONAJE] deciden buscar tesoros. Después de mucho buscar... ¡encuentran algo brillante! Perfecto para guardar de recuerdo.",
    escena:"child and companion on a treasure hunt, finding something small and shiny, both excited and happy" },
  { numero:12, titulo:"Una tarde en familia",        texto_base:"Una tarde, toda la familia se reúne. Comen juntos, ríen y cuentan historias. [NOMBRE] piensa que este es el mejor momento del verano.",
    escena:"happy family gathering outdoors eating together, golden afternoon light, child looking around gratefully" },
  { numero:13, titulo:"La noche más mágica",         texto_base:"La última noche, el cielo se llena de luces de colores. [NOMBRE] y [PERSONAJE] los miran con la boca abierta. [NOMBRE] pide un deseo.",
    escena:"spectacular fireworks lighting up the night sky, child and companion watching in complete awe" },
  { numero:14, titulo:"El último día",               texto_base:"Ha llegado el último día. [NOMBRE] quiere guardarlo todo en la memoria. Hace una foto con [PERSONAJE] en su rincón favorito.",
    escena:"child and companion taking a final photo at favorite spot, bittersweet smiles, golden summer light" },
  { numero:15, titulo:"El viaje de vuelta",          texto_base:"En el coche de regreso, [NOMBRE] va callado mirando por la ventana. [PERSONAJE] le aprieta la mano. 'Ha sido el mejor verano.'",
    escena:"child looking pensively out of car window on the way home, companion holding their hand, warm afternoon" },
  { numero:16, titulo:"El verano en el corazón",     texto_base:"Por la noche, [NOMBRE] se duerme sonriendo. El mejor verano de su vida ya vive para siempre en su corazón.",
    escena:"child sleeping peacefully with happy smile, summer souvenir glowing on bedside table, moonlight through window" }
];

app.post('/generar-verano', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, personaje, destinoNombre, destinoDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
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
    const protagonistaBible = buildProtagonistaBible(nombre, null, genero, piel, pelo, tipopelo, ojos, gafas, pecas, 'a bright summer outfit — same clothing every page');

    send({ tipo: 'estado', mensaje: '☀️ Preparando la aventura de verano...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const msgPersonaje = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 400,
      messages: [{ role: 'user', content: `Genera una descripción visual MUY detallada y específica en inglés para este personaje: "${personaje}". Colores EXACTOS, ropa con detalles, forma de cara/ojos/cuerpo, rasgos únicos. Tan precisa que el personaje quede IDÉNTICO en todas las ilustraciones. Máximo 60 palabras. Solo la descripción.` }]
    });
    const personajeDesc = msgPersonaje.content[0].text.trim();
    const personajeBible = buildPersonajeBible(personaje, personajeDesc);

    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético para un cuento de verano donde ${nombre} vive aventuras en ${destinoNombre} con ${personaje}. También una dedicatoria emotiva de 2-3 frases. SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Summer book cover portrait. ${protagonistaBible} ${personajeBible} Having fun at ${destinoNombre}, ${destinoDesc}. Bright summer colors, joyful atmosphere. Spanish title: "${tituloData.titulo}".`,
        `verano_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) { send({ tipo: 'imagen', url: '' }); }

    for (const pag of PAGINAS_VERANO) {
      send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });
      const texto = pag.texto_base
        .replace(/\[NOMBRE\]/g, nombre)
        .replace(/\[PERSONAJE\]/g, personaje)
        .replace(/\[DESTINO\]/g, destinoNombre);
      const escena = pag.escena
        .replace(/\[DESTINO_DESC\]/g, destinoDesc)
        .replace(/\[DESTINO\]/g, destinoNombre);
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          paginaPrompt(estiloBase, protagonistaBible, personajeBible, escena),
          `verano_${id}_${pag.numero}.png`
        );
      } catch(e) { console.error(`Error pág ${pag.numero}:`, e.message); }
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) });
    res.end();
  } catch(err) { send({ tipo: 'error', mensaje: err.message }); res.end(); }
});

app.listen(3000, () => console.log('🦉 StoryOwl corriendo en http://localhost:3000'));
