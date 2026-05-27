// prompts/character.js
// Character Bible — descripción visual fija del protagonista
// Se repite COMPLETA en cada prompt de imagen para consistencia máxima

function buildProtagonistaBible(params) {
  const { nombre, edad, genero, piel, pelo, tipopelo, ojos, gafas, pecas } = params;

  const hairDesc = `${tipopelo} ${pelo} hair — exact same length, volume and style in every single image, no exceptions`;
  const eyeDesc  = `${ojos} eyes — identical size, shape and color across all illustrations`;
  const skinDesc = `${piel} skin tone — consistent and unchanged in every image`;
  const glassDesc = (gafas && gafas !== 'without glasses')
    ? `, ${gafas} — always present, same frame style`
    : ', no glasses ever';
  const freckDesc = pecas ? `, ${pecas} — always visible on nose and cheeks` : '';
  const outfitDesc = 'always wearing a bright yellow t-shirt and blue denim dungarees/overalls — same outfit in every single page, no exceptions';

  return (
    `PROTAGONIST — MUST LOOK 100% IDENTICAL IN EVERY SINGLE ILLUSTRATION:\n` +
    `${edad}-year-old ${genero} named ${nombre}.\n` +
    `Hair: ${hairDesc}.\n` +
    `Eyes: ${eyeDesc}.\n` +
    `Skin: ${skinDesc}${glassDesc}${freckDesc}.\n` +
    `Outfit: ${outfitDesc}.\n` +
    `Same face proportions, same body size, same apparent age in every image.\n` +
    `NEVER change any physical feature. NEVER reinvent the character. Copy exactly.`
  );
}

function buildPersonajeBible(nombre, descripcion) {
  return (
    `COMPANION CHARACTER — MUST LOOK 100% IDENTICAL IN EVERY SINGLE ILLUSTRATION:\n` +
    `${nombre}. Fixed visual description: ${descripcion}.\n` +
    `Same design, same colors, same proportions, same details in every image.\n` +
    `NEVER reinvent or reinterpret this character.`
  );
}

module.exports = { buildProtagonistaBible, buildPersonajeBible };
