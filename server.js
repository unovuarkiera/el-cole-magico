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
    const { nombre, edad, tema, personaje, opciones, estilo, dedicatoriaPersonal, idioma } = req.body;
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

    // Idioma del cuento — los prompts de imagen siempre en inglés
    const LANG_NAMES = { es:'Spanish', en:'English', de:'German', fr:'French', pt:'Portuguese' };
    const idiomaCuento = LANG_NAMES[idioma] || 'Spanish';

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
      messages: [{ role: 'user', content: `You are an expert children's book author. Write a magical story in ${idiomaCuento}.
Main character: ${nombre}, ${edad} years old, ${genero}
Special character: ${personaje}
Theme: ${tema}
Language level: adapted for a ${edad}-year-old child — short sentences, simple vocabulary, 2-4 sentences per page maximum.

The story must have a complete narrative arc in 16 pages: introduction (1-3), development (4-12), climax (13-14), resolution (15-16).

RESPOND ONLY WITH JSON, no text before or after, no backticks. All "titulo" and "texto" fields must be in ${idiomaCuento}. The "escena" field must always be in English (for image generation).

{"titulo":"poetic title in ${idiomaCuento}","dedicatoria":"emotional dedication for ${nombre} in ${idiomaCuento}","paginas":[
{"numero":1,"titulo":"page title in ${idiomaCuento}","texto":"page text in ${idiomaCuento}","escena":"detailed scene in English for image generation"},
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
    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON encontrado');
    const cuento = JSON.parse(match[0]);

    send({ tipo: 'cuento', titulo: cuento.titulo, dedicatoria: cuento.dedicatoria });

    // PASO 3: Portada vertical 1024x1536
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} with ${personajeDesc} in a magical glowing forest at sunset. Spanish title text: "${cuento.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536', `portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch (e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // PASO 4: 16 páginas verticales individuales
    for (const pag of cuento.paginas) {
      send({ tipo: 'estado', mensaje: `🎨 Generando ilustración ${pag.numero} de 16...` });
      let imgUrl = '';
      try {
        imgUrl = await generarImagen(
          `${estiloBase}. ${protagonistaDesc} and ${personajeDesc}. Scene: ${pag.escena}. Portrait format, magical atmosphere, consistent character design throughout the book.`,
          '1024x1536', `pag_${id}_${pag.numero}.png`
        );
      } catch (e) {
        console.error(`Error imagen página ${pag.numero}:`, e.message);
      }
      send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto: pag.texto, url: imgUrl });
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'long', year:'numeric'}) });
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

const SPREADS_CUMPLE = [
  { spread:1,
    pagIzq:{ numero:1, titulo:"El gran día ha llegado", texto_base:"[NOMBRE] se despierta con una sonrisa enorme. ¡Hoy es su cumpleaños! Se levanta de un salto y corre a la ventana — el sol brilla especialmente para [NOMBRE] hoy." },
    pagDer:{ numero:2, titulo:"Nadie lo recuerda", texto_base:"En el cole, [NOMBRE] espera que alguien le diga algo... pero sus amigos hablan de otras cosas. La maestra tampoco dice nada. ¡Qué raro! Quizás todos han olvidado su cumpleaños." },
    escena:"Left side: a child waking up joyfully in a birthday-decorated bedroom with balloons and morning sunlight. Right side: same child sitting sadly in a classroom while others ignore them. Wide panoramic, seamlessly connected background." },
  { spread:2,
    pagIzq:{ numero:3, titulo:"Un día muy largo", texto_base:"Las horas pasan lentas. [NOMBRE] mira el reloj una y otra vez. Al final suena el timbre. Con los hombros caídos, [NOMBRE] sale del cole pensando que este es el peor cumpleaños del mundo." },
    pagDer:{ numero:4, titulo:"¡Aparece el amigo especial!", texto_base:"De repente, [PERSONAJE] aparece en la esquina con una enorme sonrisa. ¡Le estaba esperando! '¡Ven conmigo!' dice [PERSONAJE] misteriosamente." },
    escena:"Left side: a child walking out of school alone looking disappointed. Right side: a magical friend character appearing cheerfully at a street corner with sparkles. Wide panoramic street scene connecting both moments." },
  { spread:3,
    pagIzq:{ numero:5, titulo:"El camino a casa", texto_base:"[PERSONAJE] lleva a [NOMBRE] de vuelta a casa. Por el camino, [NOMBRE] nota que [PERSONAJE] no para de sonreír. '¿Qué pasa?' pregunta [NOMBRE]. '¡Ya verás!' responde [PERSONAJE] con picardía." },
    pagDer:{ numero:6, titulo:"¡SORPRESA!", texto_base:"[NOMBRE] abre la puerta y... ¡SORPRESA! Todos sus amigos y familiares saltan de detrás de los muebles. Globos de colores llenan el salón. ¡Nadie había olvidado el cumpleaños!" },
    escena:"Left side: child and magical friend walking home on a colorful street, friend smiling secretively. Right side: a living room explosion of balloons, confetti and surprise faces as the door opens. Panoramic joyful scene." },
  { spread:4,
    pagIzq:{ numero:7, titulo:"Lágrimas de alegría", texto_base:"[NOMBRE] se queda con la boca abierta. Los ojos se le llenan de lágrimas de felicidad. [PERSONAJE] le da un abrazo enorme. '¿Lo sabías todo el tiempo?', pregunta [NOMBRE] riendo." },
    pagDer:{ numero:8, titulo:"¡Empieza la fiesta!", texto_base:"¡La música empieza a sonar! Todo el salón está decorado con sus colores favoritos. Hay globos, serpentinas y carteles. ¡Es la fiesta más espectacular del mundo!" },
    escena:"Left side: emotional hug between child and magical friend, happy tears, warm golden light. Right side: spectacular birthday party in full swing with music, dancing, colorful decorations. Panoramic festive indoor scene." },
  { spread:5,
    pagIzq:{ numero:9, titulo:"Los juegos locos", texto_base:"¡Llegan los juegos! [PERSONAJE] organiza una carrera de sacos que acaba con todos rodando por el suelo de risa. [NOMBRE] gana y todos aplauden y celebran." },
    pagDer:{ numero:10, titulo:"El baile más divertido", texto_base:"Suena la canción favorita de [NOMBRE] y todo el mundo sale a bailar. [PERSONAJE] tiene los mejores pasos de baile. ¡[NOMBRE] y [PERSONAJE] bailan juntos en el centro!" },
    escena:"Left side: children playing sack race games, everyone laughing and falling. Right side: everyone dancing wildly at the party, child and magical friend dancing together in the center spotlight. Panoramic celebration." },
  { spread:6,
    pagIzq:{ numero:11, titulo:"La canción más especial", texto_base:"De repente, la música para. Todos se colocan en círculo alrededor de [NOMBRE]. Empiezan a cantar '¡Cumpleaños Feliz!' a todo pulmón. [NOMBRE] se sonroja de la emoción." },
    pagDer:{ numero:12, titulo:"La tarta mágica", texto_base:"[PERSONAJE] trae la tarta más impresionante que [NOMBRE] ha visto jamás. Tiene [EDAD] velas encendidas que brillan como estrellas. '¡[EDAD] añitos!' gritan todos." },
    escena:"Left side: everyone singing Happy Birthday in a circle around the glowing child, candlelight warmth. Right side: spectacular birthday cake with glowing candles being brought in, amazed faces illuminated by candlelight. Panoramic warm scene." },
  { spread:7,
    pagIzq:{ numero:13, titulo:"El deseo secreto", texto_base:"[NOMBRE] cierra los ojos con fuerza y piensa en su deseo más especial. El silencio llena la habitación. Todos esperan con la respiración contenida." },
    pagDer:{ numero:14, titulo:"¡A soplar!", texto_base:"[NOMBRE] coge aire... y ¡SOPLA! Las [EDAD] velas se apagan de golpe. ¡Todos aplauden y gritan de alegría! [PERSONAJE] da saltos de felicidad." },
    escena:"Left side: child closing eyes tightly to make a wish, magical sparkles floating around, everyone watching in hopeful silence. Right side: child blowing out all candles, smoke rising, everyone cheering with confetti raining. Panoramic magical moment." },
  { spread:8,
    pagIzq:{ numero:15, titulo:"Los regalos", texto_base:"Llega el momento de los regalos. [PERSONAJE] le entrega a [NOMBRE] un paquete envuelto en papel dorado. Dentro hay exactamente lo que [NOMBRE] había deseado." },
    pagDer:{ numero:16, titulo:"El mejor día del mundo", texto_base:"Por la noche, [NOMBRE] se mete en la cama feliz y cansado. 'Fue el mejor cumpleaños del mundo', susurra. [PERSONAJE] le guiña un ojo desde la ventana. '¡Hasta el año que viene!'" },
    escena:"Left side: child opening a beautiful golden wrapped present with magical friend watching lovingly, gift wrapping paper everywhere. Right side: child peacefully in bed smiling, birthday decorations visible, magical friend waving from window under starlight. Panoramic warm ending." }
];

app.post('/generar-cumple', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, edad, personaje, opciones, estilo, dedicatoriaPersonal } = req.body;
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

    // 16 páginas individuales verticales (2 por spread, imagen propia cada una)
    for (const sp of SPREADS_CUMPLE) {
      for (const pag of [sp.pagIzq, sp.pagDer]) {
        send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });

        const texto = pag.texto_base
          .replace(/\[NOMBRE\]/g, nombre)
          .replace(/\[PERSONAJE\]/g, personaje)
          .replace(/\[EDAD\]/g, String(edad));

        // Escena: combina la escena del spread adaptada al lado correspondiente
        const escenaBase = pag === sp.pagIzq
          ? sp.escena.replace(/Left side: /i, '').split('. Right side:')[0]
          : (sp.escena.split('Right side: ')[1] || sp.escena).split('. Wide')[0].split('. Panoramic')[0];

        let imgUrl = '';
        try {
          imgUrl = await generarImagen(
            `${estiloBase}. ${protagonistaDesc} and ${personajeDesc}. Scene: ${escenaBase}. Portrait format, consistent character design, festive birthday atmosphere.`,
            '1024x1536',
            `cumple_${id}_${pag.numero}.png`
          );
        } catch(e) {
          console.error(`Error página ${pag.numero}:`, e.message);
        }

        send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
      }
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'long', year:'numeric'}) });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});

// =============================================
// COLECCIÓN ESPECIAL: SE ME CAYÓ UN DIENTE
// =============================================

const SPREADS_DIENTE = [
  { spread:1,
    pagIzq:{ numero:1, titulo:"El diente que baila", texto_base:"Hace días que [NOMBRE] nota algo raro. Su diente de delante se mueve un poquito. Lo toca con la lengua una y otra vez. ¡Se mueve de verdad!" },
    pagDer:{ numero:2, titulo:"¡Qué miedo!", texto_base:"[NOMBRE] tiene un poco de miedo. ¿Dolerá cuando se caiga? ¿Quedará un hueco feo? [VISITANTE_NOMBRE] le dice que no pasa nada, que a todos les caen los dientes." },
    escena:"Left side: a child touching a wobbly tooth with their tongue, looking in a mirror with a funny expression, cozy bathroom. Right side: same child looking worried while a reassuring friend smiles at them. Warm home setting panoramic." },
  { spread:2,
    pagIzq:{ numero:3, titulo:"¡Se cae!", texto_base:"Al morder una manzana... ¡CRAC! [NOMBRE] se lleva la mano a la boca. ¡El diente se ha caído! Lo mira en la palma de su mano — es pequeñito y brillante." },
    pagDer:{ numero:4, titulo:"¡Hay un hueco!", texto_base:"[NOMBRE] corre al espejo. Abre la boca muy grande y... ¡hay un hueco! La lengua no para de meterse ahí. Es rarísimo pero también graciosísimo." },
    escena:"Left side: child biting an apple, surprised, holding a tiny tooth in their palm. Right side: same child opening mouth wide in front of a mirror, pointing and laughing at the gap. Panoramic fun home scene." },
  { spread:3,
    pagIzq:{ numero:5, titulo:"La noticia del cole", texto_base:"Al día siguiente, [NOMBRE] llega al cole con una gran noticia. '¡Se me cayó un diente!', anuncia a sus amigos. Todos quieren ver el hueco. ¡[NOMBRE] es el más famoso de la clase!" },
    pagDer:{ numero:6, titulo:"El diente más limpio del mundo", texto_base:"En casa, [NOMBRE] lava el diente con mucho cuidado. Con agua, con jabón, con un trapito suave. Tiene que estar perfectamente limpio para esta noche." },
    escena:"Left side: child proudly showing gap tooth to excited classmates in a sunny classroom. Right side: child carefully washing the tiny tooth in the bathroom sink with great concentration. Panoramic warm scene." },
  { spread:4,
    pagIzq:{ numero:7, titulo:"La cajita especial", texto_base:"Mamá saca una cajita muy especial. [NOMBRE] pone el diente dentro con mucho cuidado. Esta noche la cajita irá bajo la almohada. ¡El visitante mágico vendrá!" },
    pagDer:{ numero:8, titulo:"¡Esta noche viene!", texto_base:"[NOMBRE] se mete en la cama muy emocionado. Pone la cajita bajo la almohada. '¿Y si me quedo despierto para verle?', pregunta. 'Viene solo cuando los niños duermen', dice mamá." },
    escena:"Left side: child placing tiny tooth carefully in a magical small box, parent watching lovingly, warm bedroom. Right side: child lying excitedly in bed, peeking under pillow, soft night lamp light. Panoramic cozy night scene." },
  { spread:5,
    pagIzq:{ numero:9, titulo:"Las estrellas vigilan", texto_base:"[NOMBRE] intenta dormir pero está muy emocionado. Las estrellas brillan por la ventana. Los ojos se van cerrando poco a poco... hasta que se queda dormido." },
    pagDer:{ numero:10, titulo:"El visitante de medianoche", texto_base:"A medianoche, cuando todo está en silencio, [VISITANTE_NOMBRE] aparece. Se mueve sin hacer ningún ruido. Levanta la almohada con mucho cuidado para no despertar a [NOMBRE]." },
    escena:"Left side: child peacefully falling asleep with stars visible through window, moonlight. Right side: magical visitor tiptoeing into the moonlit bedroom, lifting the pillow with a soft magical glow. Panoramic enchanting night scene." },
  { spread:6,
    pagIzq:{ numero:11, titulo:"El intercambio mágico", texto_base:"[VISITANTE_NOMBRE] coge la cajita con el diente y deja en su lugar una moneda que brilla como una estrella. También deja un papelito doblado. Todo con mucho amor y cuidado." },
    pagDer:{ numero:12, titulo:"¡Buenos días!", texto_base:"Por la mañana, [NOMBRE] se despierta de golpe. ¡La almohada! Mete la mano corriendo y... ¡nota algo diferente! Saca la mano muy despacio..." },
    escena:"Left side: magical visitor carefully replacing box with a glowing magical coin and tiny note, sparkles everywhere. Right side: child waking up excitedly, reaching under pillow with wide hopeful eyes, morning sunlight. Panoramic magical scene." },
  { spread:7,
    pagIzq:{ numero:13, titulo:"La moneda mágica", texto_base:"¡Una moneda que brilla! [NOMBRE] la pone al sol y brilla con todos los colores del arcoíris. '¡Vino de verdad!', grita [NOMBRE] corriendo por la casa." },
    pagDer:{ numero:14, titulo:"El mensaje secreto", texto_base:"[NOMBRE] también encuentra el papelito. Lo desdobla con cuidado. Dice: 'Tu diente era tan valiente como tú. Cuida bien los nuevos. Con cariño, [VISITANTE_NOMBRE].'" },
    escena:"Left side: child holding magical rainbow-shimmering coin up to sunlight, running joyfully. Right side: child carefully reading a tiny magical letter with sparkling eyes, sitting on bed in morning light. Panoramic magical morning scene." },
  { spread:8,
    pagIzq:{ numero:15, titulo:"El hueco tiene nombre", texto_base:"[NOMBRE] corre al espejo. Abre la boca y mira el hueco. Ya no da miedo. Es la prueba de que está creciendo. 'Mi hueco mágico', dice [NOMBRE] muy orgulloso." },
    pagDer:{ numero:16, titulo:"Crecer es mágico", texto_base:"Esa noche, [NOMBRE] se duerme sonriendo. El hueco es como una medalla. Una medalla que dice: 'Soy valiente, estoy creciendo y la magia existe de verdad.'" },
    escena:"Left side: child smiling proudly at their reflection showing the gap tooth, confident and happy. Right side: child sleeping peacefully with a happy smile, magical coin on bedside table, moonlight through window. Panoramic warm ending." }
];

app.post('/generar-diente', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, visitanteId, visitanteNombre, visitanteDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
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
    const protagonistaDesc = `a ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, always wearing a yellow t-shirt and blue dungarees`;

    send({ tipo: 'estado', mensaje: '🦷 Preparando la historia del diente...' });

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

    // Título y dedicatoria
    const msgTitulo = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Genera un título poético y emotivo para un cuento infantil sobre el momento en que a ${nombre} se le cae su primer diente y viene ${visitanteNombre} a recogerlo.
Genera también una dedicatoria emotiva de 2-3 frases para ${nombre}.
Responde SOLO JSON sin backticks: {"titulo":"...","dedicatoria":"..."}` }]
    });
    const tituloData = JSON.parse(msgTitulo.content[0].text.match(/\{[\s\S]*\}/)[0]);

    send({ tipo: 'cuento', titulo: tituloData.titulo, dedicatoria: tituloData.dedicatoria });

    // Portada
    send({ tipo: 'estado', mensaje: '🎨 Generando portada...' });
    try {
      const portadaUrl = await generarImagen(
        `${estiloBase}. Book cover: ${protagonistaDesc} holding a tiny glowing tooth, with ${visitanteDesc} appearing magically nearby with sparkles and stars. Nighttime magical atmosphere. Spanish title: "${tituloData.titulo}". Professional children's book cover, portrait format.`,
        '1024x1536',
        `diente_portada_${id}.png`
      );
      send({ tipo: 'imagen', url: portadaUrl });
    } catch(e) {
      console.error('Error portada:', e.message);
      send({ tipo: 'imagen', url: '' });
    }

    // 16 páginas individuales verticales
    for (const sp of SPREADS_DIENTE) {
      for (const pag of [sp.pagIzq, sp.pagDer]) {
        send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });

        const texto = pag.texto_base
          .replace(/\[NOMBRE\]/g, nombre)
          .replace(/\[VISITANTE_NOMBRE\]/g, visitanteNombre)
          .replace(/\[PERSONAJE_NOMBRE\]/g, visitanteNombre);

        const escenaBase = pag === sp.pagIzq
          ? sp.escena.replace(/Left side: /i, '').split('. Right side:')[0]
          : (sp.escena.split('Right side: ')[1] || sp.escena).split('. Wide')[0].split('. Panoramic')[0];

        const escenaImg = escenaBase.replace(/\[VISITANTE_DESC\]/g, visitanteDesc);

        let imgUrl = '';
        try {
          imgUrl = await generarImagen(
            `${estiloBase}. ${protagonistaDesc} and ${visitanteDesc}. Scene: ${escenaImg}. Portrait format, consistent character design, magical warm atmosphere.`,
            '1024x1536',
            `diente_${id}_${pag.numero}.png`
          );
        } catch(e) {
          console.error(`Error página ${pag.numero}:`, e.message);
        }

        send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
      }
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'long', year:'numeric'}) });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});

// =============================================
// COLECCIÓN ESPECIAL: VACACIONES DE VERANO
// =============================================

const SPREADS_VERANO = [
  { spread:1,
    pagIzq:{ numero:1, titulo:"¡Por fin vacaciones!", texto_base:"Suena el timbre por última vez. [NOMBRE] sale corriendo del cole con los brazos en alto. ¡Han llegado las vacaciones! [PERSONAJE] le espera en la puerta con una gran sonrisa." },
    pagDer:{ numero:2, titulo:"Haciendo las maletas", texto_base:"En casa, [NOMBRE] y [PERSONAJE] hacen las maletas juntos. [NOMBRE] mete el bañador, las gafas de sol y su juguete favorito. ¡Que no falte nada para la gran aventura!" },
    escena:"Left side: a child running out of school on last day, arms raised in celebration, sunny summer day. Right side: child and companion happily packing a colorful suitcase together in a bright bedroom. Wide panoramic joyful scene." },
  { spread:2,
    pagIzq:{ numero:3, titulo:"El viaje", texto_base:"En el coche, [NOMBRE] y [PERSONAJE] cantan canciones y juegan. El paisaje va cambiando por la ventana. '¡Ya casi llegamos!', dice papá." },
    pagDer:{ numero:4, titulo:"¡El primer vistazo!", texto_base:"De repente, [NOMBRE] ve [DESTINO] por primera vez. Se le abren los ojos como platos. '¡WOW!', grita tan fuerte que todos se ríen. [PERSONAJE] le da un abrazo enorme." },
    escena:"Left side: child and companion looking excitedly out of a car window during road trip, singing and playing. Right side: child seeing [DESTINO_DESC] for the first time, eyes wide with amazement, being hugged by companion. Panoramic travel adventure scene." },
  { spread:3,
    pagIzq:{ numero:5, titulo:"La primera aventura", texto_base:"Sin perder un minuto, [NOMBRE] y [PERSONAJE] se lanzan a explorar. Corren, saltan y descubren cada rincón. ¡El verano ha empezado de verdad!" },
    pagDer:{ numero:6, titulo:"El helado más grande", texto_base:"Después de tanto correr, [NOMBRE] pide el helado más grande que ha visto en su vida. Tres bolas de colores que casi no puede sujetar. [PERSONAJE] le ayuda antes de que caiga." },
    escena:"Left side: child and companion running and exploring [DESTINO_DESC] with pure joy. Right side: child holding a giant colorful ice cream about to fall, companion catching it, both laughing. Wide panoramic summer scene." },
  { spread:4,
    pagIzq:{ numero:7, titulo:"Un momento de susto", texto_base:"De repente, algo inesperado asusta a [NOMBRE]. El corazón le late muy fuerte. Pero [PERSONAJE] está ahí. 'No pasa nada', dice [PERSONAJE]. Y [NOMBRE] respira y se siente valiente." },
    pagDer:{ numero:8, titulo:"El atardecer mágico", texto_base:"Por la tarde, [NOMBRE] y [PERSONAJE] se sientan juntos a ver el atardecer. El cielo se pinta de naranja, rosa y morado. 'Es el más bonito del mundo', susurra [NOMBRE]." },
    escena:"Left side: child looking momentarily scared at [DESTINO_DESC], companion reassuring them with a warm hand on shoulder. Right side: both sitting together watching a spectacular sunset, sky in orange pink purple. Panoramic golden hour scene." },
  { spread:5,
    pagIzq:{ numero:9, titulo:"Noche de estrellas", texto_base:"Por la noche, [NOMBRE] y [PERSONAJE] buscan constelaciones en el cielo. [PERSONAJE] señala la Osa Mayor. [NOMBRE] cierra un ojo y la sigue con el dedo. '¡La veo, la veo!'" },
    pagDer:{ numero:10, titulo:"El día de lluvia", texto_base:"Un día llueve y no se puede salir. ¡Pero [NOMBRE] y [PERSONAJE] inventan los juegos más divertidos del mundo! Construyen una cabaña con mantas y juegan hasta cansarse." },
    escena:"Left side: child and companion lying on grass looking at spectacular starry night sky, pointing at constellations. Right side: cozy blanket fort inside with rainy window visible, flashlight, board games, warm and fun. Panoramic contrasting scene." },
  { spread:6,
    pagIzq:{ numero:11, titulo:"El tesoro escondido", texto_base:"[NOMBRE] y [PERSONAJE] deciden buscar tesoros. Con un palito, dibujan un mapa. Después de mucho buscar... ¡encuentran algo brillante! Es pequeño pero perfecto para guardar como recuerdo." },
    pagDer:{ numero:12, titulo:"Una tarde en familia", texto_base:"Una tarde, toda la familia se reúne. Comen juntos, ríen y cuentan historias. [NOMBRE] mira a su alrededor y piensa que este es el mejor momento del verano." },
    escena:"Left side: child and companion on a treasure hunt at [DESTINO_DESC], finding something small and shiny, excited. Right side: happy family gathering outdoors eating together, golden afternoon light, child looking around gratefully. Panoramic warm scene." },
  { spread:7,
    pagIzq:{ numero:13, titulo:"La noche más mágica", texto_base:"La última noche, el cielo se llena de luces de colores. [NOMBRE] y [PERSONAJE] los miran con la boca abierta. Luego [NOMBRE] pide un deseo secreto." },
    pagDer:{ numero:14, titulo:"El último día", texto_base:"Ha llegado el último día. [NOMBRE] quiere guardarlo todo en la memoria. Hace una foto con [PERSONAJE] en su rincón favorito. '¡Hasta el año que viene!', dice [NOMBRE]." },
    escena:"Left side: spectacular fireworks lighting up the night sky at [DESTINO_DESC], child and companion watching in awe. Right side: child and companion taking a final photo at their favorite spot, bittersweet smiles, golden summer light. Panoramic emotional ending." },
  { spread:8,
    pagIzq:{ numero:15, titulo:"El viaje de vuelta", texto_base:"En el coche de regreso, [NOMBRE] va callado mirando por la ventana. Piensa en todo lo vivido. [PERSONAJE] le aprieta la mano. 'Ha sido el mejor verano', dice [NOMBRE] sonriendo." },
    pagDer:{ numero:16, titulo:"El verano guardado en el corazón", texto_base:"En la cama, [NOMBRE] abraza su recuerdo favorito del verano. Cierra los ojos y sonríe. El mejor verano de su vida ya vive para siempre en su corazón." },
    escena:"Left side: child looking pensively out of car window on the way home, companion holding their hand, warm afternoon light. Right side: child sleeping peacefully in bed with a happy smile, summer souvenirs nearby, cozy bedroom lamp. Panoramic peaceful ending." }
];

app.post('/generar-verano', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { nombre, personaje, destinoId, destinoNombre, destinoDesc, opciones, estilo, dedicatoriaPersonal } = req.body;
    const id = Date.now();

    const genero = opciones?.genero || 'niño';
    const piel = opciones?.piel || 'light, fair skin';
    const pelo = opciones?.pelo || 'brown';
    const tipopelo = opciones?.tipopelo || 'straight';
    const ojos = opciones?.ojos || 'brown';
    const gafas = opciones?.gafas || 'without glasses';
    const pecas = opciones?.pecas || '';
    const estiloIlustracion = estilo || 'Pixar CGI quality, 3D animation style, vibrant and detailed';
    const estiloBase = `${estiloIlustracion}, family-friendly children's book illustration, cheerful and safe for children, warm summer lighting`;
    const protagonistaDesc = `a ${genero} named ${nombre} with ${tipopelo} ${pelo} hair, ${ojos} eyes, ${piel}, ${gafas}${pecas ? ', ' + pecas : ''}, wearing a summer outfit`;

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

    // Portada
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

    // 16 páginas individuales verticales
    for (const sp of SPREADS_VERANO) {
      for (const pag of [sp.pagIzq, sp.pagDer]) {
        send({ tipo: 'estado', mensaje: `🎨 Generando página ${pag.numero} de 16...` });

        const texto = pag.texto_base
          .replace(/\[NOMBRE\]/g, nombre)
          .replace(/\[PERSONAJE\]/g, personaje);

        const escenaBase = pag === sp.pagIzq
          ? sp.escena.replace(/Left side: /i, '').split('. Right side:')[0]
          : (sp.escena.split('Right side: ')[1] || sp.escena).split('. Wide')[0].split('. Panoramic')[0];

        const escenaImg = escenaBase
          .replace(/\[DESTINO_DESC\]/g, destinoDesc)
          .replace(/\[DESTINO\]/g, destinoNombre);

        let imgUrl = '';
        try {
          imgUrl = await generarImagen(
            `${estiloBase}. ${protagonistaDesc} and ${personajeDesc}. Scene: ${escenaImg}. Portrait format, consistent character design, bright summer colors.`,
            '1024x1536', `verano_${id}_${pag.numero}.png`
          );
        } catch(e) {
          console.error(`Error página ${pag.numero}:`, e.message);
        }

        send({ tipo: 'pagina', numero: pag.numero, titulo: pag.titulo, texto, url: imgUrl });
      }
    }

    send({ tipo: 'completado', dedicatoriaPersonal: dedicatoriaPersonal || '', nombre, fecha: new Date().toLocaleDateString('es-ES', {day:'numeric', month:'long', year:'numeric'}) });
    res.end();

  } catch(err) {
    send({ tipo: 'error', mensaje: err.message });
    res.end();
  }
});
