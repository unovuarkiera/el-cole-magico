// backend/workers/storyWorker.js
// Genera la historia completa con Claude Sonnet

const Anthropic = require('@anthropic-ai/sdk');
const { buildStoryPrompt, buildPersonajePrompt } = require('../../prompts/story');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

/**
 * Genera la descripción visual del personaje secundario
 */
async function generarDescripcionPersonaje(personaje) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 200,
    messages: [{ role: 'user', content: buildPersonajePrompt(personaje) }]
  });
  return msg.content[0].text.trim();
}

/**
 * Genera la historia completa (18 páginas)
 */
async function generarHistoria(params) {
  const { nombre, edad, genero, tema, personaje, idioma } = params;

  const prompt = buildStoryPrompt({ nombre, edad, genero, tema, personaje, idioma });

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = msg.content[0].text.trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude no devolvió JSON válido en la historia');

  let cuento;
  try {
    cuento = JSON.parse(match[0]);
  } catch(e) {
    // Limpieza de caracteres problemáticos
    const cleaned = match[0]
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/,\s*([}\]])/g, '$1');
    cuento = JSON.parse(cleaned);
  }

  // Validar que tiene 18 páginas
  if (!cuento.paginas || cuento.paginas.length < 16) {
    throw new Error(`Historia incompleta: ${cuento.paginas?.length || 0} páginas (mínimo 16)`);
  }

  return cuento;
}

/**
 * Flujo completo de generación de historia:
 * 1. Descripción del personaje secundario
 * 2. Historia completa
 */
async function generarContenido(params, onProgress) {
  const { personaje } = params;

  // Paso 1: Personaje secundario
  if (onProgress) onProgress('personaje', 'Creando los personajes...');
  const personajeDesc = await generarDescripcionPersonaje(personaje);
  console.log(`[storyWorker] Personaje generado: ${personajeDesc.substring(0, 60)}...`);

  // Paso 2: Historia
  if (onProgress) onProgress('historia', 'Escribiendo el cuento...');
  const cuento = await generarHistoria(params);
  console.log(`[storyWorker] Historia generada: "${cuento.titulo}" (${cuento.paginas.length} páginas)`);

  return {
    titulo: cuento.titulo,
    dedicatoria: cuento.dedicatoria,
    paginas: cuento.paginas,
    personajeDesc
  };
}

module.exports = { generarContenido, generarHistoria, generarDescripcionPersonaje };
