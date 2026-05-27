// prompts/spreads.js
// Prompts para generación de spreads dobles 2048×1024
// Opción B: imagen continua + franja de texto separada inferior

const ESTILOS = {
  pixar:     'Pixar CGI quality, 3D animation style, vibrant and highly detailed, subsurface scattering on skin',
  acuarela:  'soft watercolor illustration, delicate visible brushstrokes, pastel and muted tones, dreamy atmosphere',
  comic:     'comic book illustration, bold clean outlines, flat cel-shaded colors, dynamic and energetic',
  clasico:   'classic golden age children\'s book illustration, oil painted textures, warm amber tones, detailed backgrounds',
  manga:     'Japanese manga style, expressive oversized eyes, clean linework, anime quality shading'
};

/**
 * Construye el prompt para un spread doble
 * @param {Object} params
 * @param {string} params.escenaIzq — descripción escena página izquierda (en inglés)
 * @param {string} params.escenaDer — descripción escena página derecha (en inglés)
 * @param {string} params.protagonistaBible — character bible del protagonista
 * @param {string} params.personajeBible — character bible del personaje secundario
 * @param {string} params.estilo — clave del estilo (pixar, acuarela, comic, clasico, manga)
 * @param {boolean} params.esPrimero — si es el primer spread (escena introductoria)
 */
function buildSpreadPrompt(params) {
  const { escenaIzq, escenaDer, protagonistaBible, personajeBible, estilo = 'pixar', esPrimero = false } = params;

  const estiloBase = ESTILOS[estilo] || ESTILOS.pixar;

  return `${estiloBase}, family-friendly children's book double-page spread illustration, safe for children of all ages.

LAYOUT: This is a DOUBLE PAGE SPREAD. Landscape format, ratio 2:1 (wide). The image flows seamlessly across both pages as ONE continuous panoramic scene. The LEFT HALF shows one scene, the RIGHT HALF shows a connected scene. Both halves share a continuous background that flows naturally through the center.

CRITICAL COMPOSITION RULES:
- The CENTER of the image (spine/gutter area, approximately 5% of width on each side of center) must contain ONLY background elements — sky, landscape, trees, etc. NO characters, NO important objects near the center. This area will be cut when printing.
- BOTTOM 25% of the image on each half: leave this area with darker tones or clear background — this is where the text panel will be placed.
- Characters should be in the OUTER 70% of each half, not near the center.
- The scene should feel like one wide cinematic shot.

LEFT HALF scene: ${escenaIzq}
RIGHT HALF scene: ${escenaDer}

${protagonistaBible}

${personajeBible}

LIGHTING: Warm, soft, cinematic lighting. Rich colors, depth of field. Professional children's book quality.
${esPrimero ? 'This is the opening spread — establish the world vividly.' : ''}
NO text, NO letters, NO words anywhere in the image.`;
}

/**
 * Prompt para la portada (imagen cuadrada individual 1024×1024)
 */
function buildCoverPrompt(params) {
  const { titulo, protagonistaBible, personajeBible, estilo = 'pixar' } = params;

  const estiloBase = ESTILOS[estilo] || ESTILOS.pixar;

  return `${estiloBase}, children's book COVER illustration. Square format 1:1.

COMPOSITION: Hero shot. The protagonist and companion character are prominently featured in the center-lower area. Rich, detailed, magical background fills the upper area. The composition should leave visual space at the TOP (for title text overlay) and BOTTOM (for author/brand overlay). Epic, inviting, premium feel.

${protagonistaBible}

${personajeBible}

MOOD: Magical, adventurous, warm, inviting. This must make a child (and parent) want to open the book immediately.
NO text, NO letters, NO words anywhere in the image.`;
}

/**
 * Genera las descripciones de escena para los 9 spreads a partir de las 18 páginas
 * @param {Array} paginas — array de 18 páginas con { numero, titulo, texto, escena }
 * @returns {Array} 9 spreads con { escenaIzq, escenaDer, pagIzq, pagDer }
 */
function agruparEnSpreads(paginas) {
  const spreads = [];
  for (let i = 0; i < paginas.length; i += 2) {
    spreads.push({
      numero: Math.floor(i / 2) + 1,
      pagIzq: paginas[i],
      pagDer: paginas[i + 1] || null,
      escenaIzq: paginas[i]?.escena || '',
      escenaDer: paginas[i + 1]?.escena || '',
    });
  }
  return spreads;
}

module.exports = { buildSpreadPrompt, buildCoverPrompt, agruparEnSpreads, ESTILOS };
