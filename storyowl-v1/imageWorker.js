// backend/workers/imageWorker.js
// Genera spreads dobles 2048×1024 con gpt-image-2
// Divide cada spread en 2 páginas independientes con sharp

const fetch = require('node-fetch');
const sharp = require('sharp');
const { buildSpreadPrompt, buildCoverPrompt, agruparEnSpreads } = require('../../prompts/spreads');
const { buildProtagonistaBible, buildPersonajeBible } = require('../../prompts/character');
const SPEC = require('../../config/gelato-20x20');

const OPENAI_KEY = process.env.OPENAI_KEY;

/**
 * Genera una imagen con gpt-image-2
 */
async function generarImagen({ prompt, size, quality = 'medium' }) {
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt,
      size,
      quality,
      n: 1,
      response_format: 'b64_json'
    })
  });

  const data = await resp.json();
  if (!data.data?.[0]) throw new Error(`Error gpt-image-2: ${JSON.stringify(data)}`);
  return Buffer.from(data.data[0].b64_json, 'base64');
}

/**
 * Divide un spread 2048×1024 en dos páginas 1024×1024
 * con overlap de bleed en el centro
 */
async function dividirSpread(spreadBuffer) {
  const W = 2048, H = 1024;
  const halfW = W / 2; // 1024
  const overlap = 20; // pixels de overlap en el centro para evitar línea de corte visible

  const paginaIzq = await sharp(spreadBuffer)
    .extract({ left: 0, top: 0, width: halfW + overlap, height: H })
    .resize(halfW, H) // recortar el overlap
    .png()
    .toBuffer();

  const paginaDer = await sharp(spreadBuffer)
    .extract({ left: halfW - overlap, top: 0, width: halfW + overlap, height: H })
    .resize(halfW, H)
    .png()
    .toBuffer();

  return { paginaIzq, paginaDer };
}

/**
 * Genera la portada (imagen cuadrada 1024×1024)
 */
async function generarPortada({ titulo, protagonistaBible, personajeBible, estilo, quality }) {
  const prompt = buildCoverPrompt({ titulo, protagonistaBible, personajeBible, estilo });
  const buffer = await generarImagen({ prompt, size: '1024x1024', quality });
  return buffer;
}

/**
 * Genera todos los spreads para un job
 * @param {Object} job — datos del job
 * @param {Function} onProgress — callback de progreso (spreadNum, total)
 */
async function generarSpreads({ job, quality = 'medium', soloPreview = false, onProgress }) {
  const {
    nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas,
    estilo, paginas, personaje, personajeDesc, titulo
  } = job;

  // Construir character bibles
  const protagonistaBible = buildProtagonistaBible({
    nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas
  });
  const personajeBible = buildPersonajeBible(personaje, personajeDesc);

  // Agrupar 18 páginas en 9 spreads
  const spreads = agruparEnSpreads(paginas);

  // Si es preview, solo generar portada + spreads 1 y 2
  const spreadsAGenerar = soloPreview ? spreads.slice(0, 2) : spreads;
  const total = spreadsAGenerar.length + 1; // +1 por la portada

  const resultado = {
    portada: null,
    spreads: []
  };

  // 1. Portada
  console.log(`[imageWorker] Generando portada...`);
  resultado.portada = await generarPortada({
    titulo, protagonistaBible, personajeBible, estilo,
    quality: soloPreview ? 'low' : quality
  });
  if (onProgress) onProgress(1, total);

  // 2. Spreads
  for (const [i, spread] of spreadsAGenerar.entries()) {
    console.log(`[imageWorker] Generando spread ${spread.numero} de ${spreadsAGenerar.length}...`);

    const prompt = buildSpreadPrompt({
      escenaIzq: spread.escenaIzq,
      escenaDer: spread.escenaDer,
      protagonistaBible,
      personajeBible,
      estilo,
      esPrimero: spread.numero === 1
    });

    // Reintentos automáticos
    let spreadBuffer = null;
    for (let intento = 0; intento < 3; intento++) {
      try {
        spreadBuffer = await generarImagen({
          prompt,
          size: '2048x1024',
          quality: soloPreview ? 'low' : quality
        });
        break;
      } catch(e) {
        console.error(`[imageWorker] Error spread ${spread.numero} intento ${intento + 1}:`, e.message);
        if (intento === 2) throw e;
        await new Promise(r => setTimeout(r, 3000)); // esperar 3s antes de reintentar
      }
    }

    const { paginaIzq, paginaDer } = await dividirSpread(spreadBuffer);

    resultado.spreads.push({
      numero: spread.numero,
      spreadBuffer,
      paginaIzq,
      paginaDer,
      pagIzq: spread.pagIzq,
      pagDer: spread.pagDer
    });

    if (onProgress) onProgress(i + 2, total);
  }

  return resultado;
}

module.exports = { generarPortada, generarSpreads, generarImagen, dividirSpread };
