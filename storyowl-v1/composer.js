// pdf-engine/composer.js
// Motor PDF profesional server-side
// Genera PDFs 300dpi aptos para Gelato 20x20cm
// Opción B: imagen continua + franja de texto inferior

const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const SPEC = require('../config/gelato-20x20');

// Dimensiones del canvas a 300dpi para 20x20cm con bleed
// 206mm × 206mm a 300dpi = 2433 × 2433 pixels
const PX = 2433;  // página individual con bleed
const PY = 2433;

// Safe zones en pixels (5mm a 300dpi = 59px)
const BLEED = 118;  // 3mm bleed
const SAFE  = 59;   // 5mm safe zone adicional al bleed

// Zona de texto (franja inferior Opción B)
// El texto ocupa el 28% inferior de la página
const TEXT_HEIGHT_RATIO = 0.28;
const TEXT_Y = Math.round(PY * (1 - TEXT_HEIGHT_RATIO));

/**
 * Carga una imagen desde buffer o URL
 */
async function cargarImagen(src) {
  if (Buffer.isBuffer(src)) {
    return await loadImage(src);
  }
  return await loadImage(src);
}

/**
 * Dibuja imagen a sangre completa (cover style)
 */
function drawImageBleed(ctx, img) {
  const scale = Math.max(PX / img.width, PY / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (PX - w) / 2;
  const y = (PY - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}

/**
 * Ajusta el tamaño de fuente para que el texto quepa en maxWidth × maxLines
 */
function fitText(ctx, text, fontBase, maxWidth, maxLines, minSize, maxSize) {
  for (let sz = maxSize; sz >= minSize; sz -= 2) {
    ctx.font = fontBase.replace('SIZE', String(sz));
    const words = text.split(' ');
    let lines = 1, line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth) { lines++; line = word; }
      else line = test;
    }
    if (lines <= maxLines) return sz;
  }
  return minSize;
}

/**
 * Divide texto en líneas que caben en maxWidth
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Compone una página interior (Opción B):
 * - Imagen a sangre completa
 * - Gradiente oscuro en zona inferior
 * - Panel translúcido
 * - Número + título + texto
 */
async function componerPaginaInterior(params) {
  const { imageBuffer, numeroPagina, titulo, texto, idioma = 'es' } = params;

  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  // 1. Fondo fallback
  ctx.fillStyle = '#1a0840';
  ctx.fillRect(0, 0, PX, PY);

  // 2. Imagen a sangre
  if (imageBuffer) {
    try {
      const img = await cargarImagen(imageBuffer);
      drawImageBleed(ctx, img);
    } catch(e) {
      console.error('[composer] Error cargando imagen:', e.message);
    }
  }

  // 3. Gradiente oscuro en zona inferior (Opción B)
  const gradStartY = TEXT_Y - 200;
  const grad = ctx.createLinearGradient(0, gradStartY, 0, PY);
  grad.addColorStop(0, 'rgba(4, 1, 12, 0)');
  grad.addColorStop(0.4, 'rgba(4, 1, 12, 0.65)');
  grad.addColorStop(1, 'rgba(4, 1, 12, 0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, gradStartY, PX, PY - gradStartY);

  // 4. Panel translúcido con bordes redondeados
  const panX = BLEED + SAFE;
  const panW = PX - (BLEED + SAFE) * 2;
  const panY = TEXT_Y - 20;
  const panH = PY - panY - BLEED - SAFE;
  const radius = 32;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(panX + radius, panY);
  ctx.lineTo(panX + panW - radius, panY);
  ctx.quadraticCurveTo(panX + panW, panY, panX + panW, panY + radius);
  ctx.lineTo(panX + panW, panY + panH - radius);
  ctx.quadraticCurveTo(panX + panW, panY + panH, panX + panW - radius, panY + panH);
  ctx.lineTo(panX + radius, panY + panH);
  ctx.quadraticCurveTo(panX, panY + panH, panX, panY + panH - radius);
  ctx.lineTo(panX, panY + radius);
  ctx.quadraticCurveTo(panX, panY, panX + radius, panY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8, 3, 24, 0.55)';
  ctx.fill();
  ctx.restore();

  // 5. Línea dorada decorativa
  ctx.strokeStyle = 'rgba(247, 201, 75, 0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(panX + 50, panY + 8);
  ctx.lineTo(panX + panW - 50, panY + 8);
  ctx.stroke();

  // 6. Zona de texto
  const textX = panX + 60;
  const textW = panW - 120;
  let curY = panY + 52;

  // Número de página
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillStyle = 'rgba(247, 201, 75, 1)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.textAlign = 'left';
  ctx.fillText(`${numeroPagina}`, textX, curY);
  curY += 52;

  // Título
  const titleSize = fitText(ctx, titulo || '', 'italic bold SIZEpx Georgia, serif', textW, 2, 32, 58);
  ctx.font = `italic bold ${titleSize}px Georgia, serif`;
  ctx.fillStyle = 'rgba(192, 132, 252, 1)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 6;
  const titleLines = wrapText(ctx, titulo || '', textW);
  const titleLineH = Math.round(titleSize * 1.3);
  for (const line of titleLines.slice(0, 2)) {
    ctx.fillText(line, textX, curY);
    curY += titleLineH;
  }
  curY += 16;

  // Texto del cuento
  const bodySize = fitText(ctx, texto || '', 'SIZEpx Georgia, serif', textW, 4, 28, 42);
  ctx.font = `${bodySize}px Georgia, serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 1)';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  const bodyLines = wrapText(ctx, texto || '', textW);
  const bodyLineH = Math.round(bodySize * 1.6);
  for (const line of bodyLines.slice(0, 4)) {
    if (curY + bodyLineH > panY + panH - 20) break;
    ctx.fillText(line, textX, curY);
    curY += bodyLineH;
  }

  // Logo discreto
  ctx.shadowBlur = 0;
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillStyle = 'rgba(247, 201, 75, 0.4)';
  ctx.textAlign = 'right';
  ctx.fillText('🦉 storyowl.com', panX + panW - 50, panY + panH - 24);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

/**
 * Compone la portada
 */
async function componerPortada(params) {
  const { imageBuffer, titulo } = params;

  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#0d0820';
  ctx.fillRect(0, 0, PX, PY);

  // Imagen a sangre
  if (imageBuffer) {
    try {
      const img = await cargarImagen(imageBuffer);
      drawImageBleed(ctx, img);
    } catch(e) {
      console.error('[composer] Error portada:', e.message);
    }
  }

  // Gradiente inferior para el título
  const grad = ctx.createLinearGradient(0, PY * 0.6, 0, PY);
  grad.addColorStop(0, 'rgba(4, 1, 12, 0)');
  grad.addColorStop(1, 'rgba(4, 1, 12, 0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, PY * 0.6, PX, PY * 0.4);

  // Título
  const titleArea = PX - (BLEED + SAFE) * 2;
  const titleSize = fitText(ctx, titulo || '', 'bold SIZEpx Fraunces, Georgia, serif', titleArea, 3, 48, 96);
  ctx.font = `bold ${titleSize}px Georgia, serif`;
  ctx.fillStyle = '#f7c94b';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.textAlign = 'center';

  const titleLines = wrapText(ctx, titulo || '', titleArea);
  const titleLineH = Math.round(titleSize * 1.25);
  let ty = PY * 0.82 - (titleLines.length - 1) * titleLineH / 2;
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, PX / 2, ty);
    ty += titleLineH;
  }

  // Logo
  ctx.shadowBlur = 0;
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('🦉 StoryOwl', PX / 2, PY - BLEED - SAFE - 20);

  return canvas.toBuffer('image/png');
}

/**
 * Compone la página de dedicatoria (sin imagen IA — pura maquetación)
 */
async function componerDedicatoria(params) {
  const { nombre, dedicatoria, dedicatoriaPersonal, idioma = 'es' } = params;

  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  // Fondo gradiente claro
  const grad = ctx.createLinearGradient(0, 0, 0, PY);
  grad.addColorStop(0, '#fff9f0');
  grad.addColorStop(1, '#fdf4ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PX, PY);

  // Decoración: círculo central suave
  const radGrad = ctx.createRadialGradient(PX/2, PY/2, 0, PX/2, PY/2, PX * 0.4);
  radGrad.addColorStop(0, 'rgba(107, 63, 168, 0.06)');
  radGrad.addColorStop(1, 'rgba(107, 63, 168, 0)');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, PX, PY);

  // Línea dorada superior
  ctx.strokeStyle = 'rgba(247, 201, 75, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(PX * 0.2, PY * 0.18);
  ctx.lineTo(PX * 0.8, PY * 0.18);
  ctx.stroke();

  // "Para" / "For" / "Für" / "Pour" / "Para"
  const paraTexto = { es:'Para', en:'For', de:'Für', fr:'Pour', pt:'Para' }[idioma] || 'Para';
  ctx.font = 'italic 72px Georgia, serif';
  ctx.fillStyle = 'rgba(107, 63, 168, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(paraTexto, PX / 2, PY * 0.28);

  // Nombre del niño
  const nombreSize = fitText(ctx, nombre || '', 'bold SIZEpx Georgia, serif', PX * 0.7, 1, 72, 160);
  ctx.font = `bold ${nombreSize}px Georgia, serif`;
  ctx.fillStyle = '#3a2070';
  ctx.fillText(nombre || '', PX / 2, PY * 0.4);

  // Línea separadora
  ctx.strokeStyle = 'rgba(247, 201, 75, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX * 0.3, PY * 0.46);
  ctx.lineTo(PX * 0.7, PY * 0.46);
  ctx.stroke();

  // Dedicatoria del cuento
  if (dedicatoria) {
    const dedSize = fitText(ctx, dedicatoria, 'italic SIZEpx Georgia, serif', PX * 0.65, 4, 32, 48);
    ctx.font = `italic ${dedSize}px Georgia, serif`;
    ctx.fillStyle = 'rgba(58, 32, 112, 0.65)';
    const dedLines = wrapText(ctx, dedicatoria, PX * 0.65);
    const dedLineH = Math.round(dedSize * 1.6);
    let dy = PY * 0.54;
    for (const line of dedLines.slice(0, 4)) {
      ctx.fillText(line, PX / 2, dy);
      dy += dedLineH;
    }
  }

  // Dedicatoria personal (del padre/madre)
  if (dedicatoriaPersonal) {
    const persSize = fitText(ctx, dedicatoriaPersonal, 'SIZEpx Georgia, serif', PX * 0.6, 3, 28, 38);
    ctx.font = `${persSize}px Georgia, serif`;
    ctx.fillStyle = 'rgba(58, 32, 112, 0.5)';
    const persLines = wrapText(ctx, dedicatoriaPersonal, PX * 0.6);
    const persLineH = Math.round(persSize * 1.5);
    let py = PY * 0.75;
    for (const line of persLines.slice(0, 3)) {
      ctx.fillText(line, PX / 2, py);
      py += persLineH;
    }
  }

  // Logo StoryOwl
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.fillStyle = 'rgba(107, 63, 168, 0.4)';
  ctx.fillText('🦉 StoryOwl', PX / 2, PY - BLEED - SAFE - 40);

  // Línea dorada inferior
  ctx.strokeStyle = 'rgba(247, 201, 75, 0.4)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(PX * 0.2, PY * 0.92);
  ctx.lineTo(PX * 0.8, PY * 0.92);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

/**
 * Compone la guarda (página de color sólido)
 */
async function componerGuarda() {
  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  // Color sólido de guarda StoryOwl
  ctx.fillStyle = SPEC.guarda.color;
  ctx.fillRect(0, 0, PX, PY);

  // Patrón de estrellas muy sutil
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let i = 0; i < 80; i++) {
    const sx = Math.random() * PX;
    const sy = Math.random() * PY;
    const sr = Math.random() * 6 + 2;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

/**
 * Compone la página FIN
 */
async function componerFin(params) {
  const { nombre, idioma = 'es' } = params;

  const finTexto = { es:'¡FIN!', en:'THE END', de:'ENDE', fr:'FIN', pt:'FIM' }[idioma] || '¡FIN!';
  const creadoParaTexto = {
    es:'Un cuento creado para', en:'A story created for',
    de:'Eine Geschichte für', fr:'Une histoire pour', pt:'Uma história para'
  }[idioma] || 'Un cuento creado para';

  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  // Fondo
  const grad = ctx.createLinearGradient(0, 0, 0, PY);
  grad.addColorStop(0, '#0d0820');
  grad.addColorStop(1, '#160a35');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PX, PY);

  // Estrellas
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    ctx.arc(Math.random()*PX, Math.random()*PY*0.5, Math.random()*5+1, 0, Math.PI*2);
    ctx.fill();
  }

  // Línea dorada
  ctx.strokeStyle = 'rgba(247,201,75,0.4)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(PX*0.2, PY*0.42); ctx.lineTo(PX*0.8, PY*0.42); ctx.stroke();

  // FIN
  ctx.textAlign = 'center';
  ctx.font = `italic bold 200px Georgia, serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(107,63,168,0.6)'; ctx.shadowBlur = 40;
  ctx.fillText(finTexto, PX/2, PY*0.54);
  ctx.shadowBlur = 0;

  // "Creado para nombre"
  ctx.font = 'italic 64px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(creadoParaTexto, PX/2, PY*0.65);
  ctx.font = 'bold 88px Georgia, serif';
  ctx.fillStyle = 'rgba(192,132,252,0.9)';
  ctx.fillText(nombre || '', PX/2, PY*0.74);

  // Línea + logo
  ctx.strokeStyle = 'rgba(247,201,75,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PX*0.25, PY*0.82); ctx.lineTo(PX*0.75, PY*0.82); ctx.stroke();
  ctx.font = 'bold 42px Arial, sans-serif';
  ctx.fillStyle = 'rgba(247,201,75,0.4)';
  ctx.fillText('🦉 storyowl.com', PX/2, PY*0.88);

  return canvas.toBuffer('image/png');
}

/**
 * Compone la contraportada
 */
async function componerContraportada(params) {
  const { idioma = 'es' } = params;

  const frases = {
    es: ['Que la magia de las historias', 'te acompañe siempre.'],
    en: ['May the magic of stories', 'be with you always.'],
    de: ['Möge die Magie der Geschichten', 'immer bei dir sein.'],
    fr: ['Que la magie des histoires', 'te soit toujours fidèle.'],
    pt: ['Que a magia das histórias', 'te acompanhe sempre.'],
  };
  const [frase1, frase2] = frases[idioma] || frases.es;

  const canvas = createCanvas(PX, PY);
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, PY);
  grad.addColorStop(0, '#080318'); grad.addColorStop(0.5, '#1a0840'); grad.addColorStop(1, '#080318');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, PX, PY);

  const radGrad = ctx.createRadialGradient(PX/2, PY/2, 0, PX/2, PY/2, PX*0.45);
  radGrad.addColorStop(0, 'rgba(107,63,168,0.18)'); radGrad.addColorStop(1, 'rgba(107,63,168,0)');
  ctx.fillStyle = radGrad; ctx.fillRect(0, 0, PX, PY);

  ctx.textAlign = 'center';
  ctx.font = 'bold 220px Arial, sans-serif';
  ctx.fillStyle = 'rgba(247,201,75,0.6)';
  ctx.fillText('🦉', PX/2, PY*0.38);

  ctx.strokeStyle = 'rgba(247,201,75,0.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(PX*0.2, PY*0.43); ctx.lineTo(PX*0.8, PY*0.43); ctx.stroke();

  ctx.font = 'italic bold 80px Georgia, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10;
  ctx.fillText(frase1, PX/2, PY*0.54);
  ctx.fillText(frase2, PX/2, PY*0.63);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(247,201,75,0.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PX*0.25, PY*0.70); ctx.lineTo(PX*0.75, PY*0.70); ctx.stroke();

  ctx.font = 'bold 56px Arial, sans-serif';
  ctx.fillStyle = 'rgba(247,201,75,0.55)';
  ctx.fillText('StoryOwl · storyowl.com', PX/2, PY*0.78);

  return canvas.toBuffer('image/png');
}

module.exports = {
  componerPaginaInterior,
  componerPortada,
  componerDedicatoria,
  componerGuarda,
  componerFin,
  componerContraportada,
  PX, PY, TEXT_Y, BLEED, SAFE
};
