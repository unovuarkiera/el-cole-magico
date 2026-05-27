// config/gelato-20x20.js
// Especificaciones técnicas definitivas para Gelato
// Formato: Libro de fotos tapa dura 20x20 cm
// Orientación: Cuadrado
// Páginas: 30 mínimo

const GELATO_SPEC = {

  // ── DIMENSIONES DEL LIBRO ─────────────────────────────
  libro: {
    widthMM: 200,          // 20 cm
    heightMM: 200,         // 20 cm
    formato: '20x20',
    orientacion: 'cuadrado',
    tapaDura: true,
    paginasMinimas: 30,
    paginasTotales: 30,
  },

  // ── BLEED Y SAFE ZONES ────────────────────────────────
  imprenta: {
    bleedMM: 3,            // 3mm sangre por cada lado
    safezoneMM: 5,         // 5mm zona segura (sin texto crítico)
    // Con bleed: 206x206mm por página
    // Con bleed: 412x206mm por spread
    widthConBleedMM: 206,
    heightConBleedMM: 206,
    spreadWidthConBleedMM: 412,
  },

  // ── RESOLUCIÓN A 300 DPI ──────────────────────────────
  dpi300: {
    // Página individual con bleed
    pageWidthPX: 2433,     // 206mm a 300dpi
    pageHeightPX: 2433,    // 206mm a 300dpi
    // Spread doble con bleed
    spreadWidthPX: 4866,   // 412mm a 300dpi
    spreadHeightPX: 2433,  // 206mm a 300dpi
    // Bleed en pixels
    bleedPX: 118,          // 10mm total (5mm cada lado no, 3mm × 2 lados = 6mm, 118px ≈ 10mm a 300dpi)
    // Safe zone en pixels
    safezonePX: 197,       // 5mm × 2 lados = 591 total
    // Área de contenido seguro (por página)
    contentWidthPX: 2039,  // 206 - 6bleed - 10safe = 190mm → 2244px... simplificado
    contentHeightPX: 2039,
  },

  // ── GENERACIÓN DE IMÁGENES IA ─────────────────────────
  generacion: {
    // Spreads: imagen landscape apaisada que se divide en 2 páginas
    spreadWidthPX: 2048,   // gpt-image-2 soporta hasta 2048
    spreadHeightPX: 1024,  // ratio 2:1 perfecto para spread cuadrado
    ratio: '2:1',
    quality: 'medium',     // low para preview, medium para libro final
    format: 'png',

    // Portada: imagen cuadrada individual
    coverWidthPX: 1024,
    coverHeightPX: 1024,
    coverRatio: '1:1',
  },

  // ── ESTRUCTURA DE PÁGINAS ─────────────────────────────
  estructura: {
    totalPaginas: 30,
    // Página 1:  Portada (imagen IA cuadrada)
    // Página 2:  Guarda inicial (color sólido, sin IA)
    // Página 3:  Dedicatoria (generada por código)
    // Páginas 4-21: 9 spreads = 18 páginas de historia
    // Página 22: FIN (generada por código)
    // Página 23: Contraportada interior (generada por código)
    // Páginas 24-28: Guardas finales (color sólido, sin IA)
    // Páginas 29-30: Padding hasta mínimo Gelato

    spreadsHistoria: 9,    // 9 spreads × 2 páginas = 18 páginas de historia
    paginasIA: 10,         // 1 portada + 9 spreads = 10 llamadas a gpt-image-2
    paginasSinIA: 20,      // resto generado por código (guardas, dedicatoria, fin, etc.)
  },

  // ── PRECIOS GELATO (España, sin IVA) ─────────────────
  precios: {
    impresion30pag: 8.23,  // € sin IVA a 30 páginas
    envioEspana: 4.80,     // € envío estándar España
    totalEspana: 13.03,
  },

  // ── COLORES DE GUARDA ─────────────────────────────────
  guarda: {
    color: '#0d0820',      // Morado oscuro StoryOwl
    colorHex: '0d0820',
  }
};

module.exports = GELATO_SPEC;
