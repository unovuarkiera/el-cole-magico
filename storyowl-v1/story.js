// prompts/story.js
// Prompts para generación de la historia con Claude
// 18 páginas (9 spreads) + estructura narrativa completa

const LANG_NAMES = {
  es: 'Spanish', en: 'English', de: 'German', fr: 'French', pt: 'Portuguese'
};

/**
 * Prompt para generar la historia completa
 * 18 páginas en lugar de 16 para llegar a 30 páginas en Gelato
 */
function buildStoryPrompt(params) {
  const { nombre, edad, genero, tema, personaje, idioma = 'es' } = params;
  const idiomaCuento = LANG_NAMES[idioma] || 'Spanish';

  return `You are an expert children's book author and editor. Write a complete, emotionally engaging children's story in ${idiomaCuento}.

CHARACTER: ${nombre}, ${edad} years old, ${genero}
COMPANION: ${personaje}
THEME/ADVENTURE: ${tema}
LANGUAGE LEVEL: Adapted for a ${edad}-year-old. Short, clear sentences. Maximum 3-4 sentences per page. Vocabulary appropriate for age.

STORY STRUCTURE (18 pages, 9 double-page spreads):
- Pages 1-2 (Spread 1): Introduction — establish the character and their world
- Pages 3-4 (Spread 2): The call to adventure — something happens that starts the journey
- Pages 5-6 (Spread 3): Setting off — the adventure begins
- Pages 7-8 (Spread 4): First challenge or discovery
- Pages 9-10 (Spread 5): Deeper into the adventure — midpoint
- Pages 11-12 (Spread 6): Complication or obstacle
- Pages 13-14 (Spread 7): Climax — the most exciting moment
- Pages 15-16 (Spread 8): Resolution — the problem is solved
- Pages 17-18 (Spread 9): Emotional ending — warmth, lesson, happiness

CRITICAL RULES FOR THE "escena" FIELD:
- Always in English regardless of story language
- Describe TWO connected scenes: one for the LEFT page, one for the RIGHT page
- Format: "LEFT: [scene description]. RIGHT: [scene description]."
- Characters are in the outer areas of each page, NOT near the center
- Bottom 25% of each page has darker/simpler background for text panel
- Be specific and visual — describe actions, emotions, environment, lighting
- Do NOT include text or letters in the scene description

CRITICAL JSON RULES:
- Respond ONLY with valid JSON, no text before or after, no backticks
- Use ONLY double quotes for all strings
- Do NOT use apostrophes inside string values — rephrase to avoid them
- All "titulo" and "texto" fields in ${idiomaCuento}
- "escena" field always in English

{
  "titulo": "Poetic, evocative title in ${idiomaCuento}",
  "dedicatoria": "Emotional 2-sentence dedication for ${nombre} in ${idiomaCuento}",
  "paginas": [
    {"numero": 1, "titulo": "Page title in ${idiomaCuento}", "texto": "Page text in ${idiomaCuento}", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 2, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 3, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 4, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 5, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 6, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 7, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 8, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 9, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 10, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 11, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 12, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 13, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 14, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 15, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 16, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 17, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."},
    {"numero": 18, "titulo": "...", "texto": "...", "escena": "LEFT: [scene]. RIGHT: [scene]."}
  ]
}`;
}

/**
 * Prompt para generar descripción visual del personaje secundario
 */
function buildPersonajePrompt(personaje) {
  return `Generate a detailed, consistent visual description in English for this children's book character: "${personaje}".

Include: exact colors (not approximate), clothing details, distinctive physical features, unique traits that make this character instantly recognizable.
The description must be so precise that an image AI can draw this character IDENTICALLY in every illustration.
Maximum 60 words. Only the description, no explanations. No apostrophes.`;
}

module.exports = { buildStoryPrompt, buildPersonajePrompt, LANG_NAMES };
