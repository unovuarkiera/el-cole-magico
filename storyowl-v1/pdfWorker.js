// backend/workers/pdfWorker.js
// Genera el PDF profesional server-side
// 300dpi, 30 páginas, apto para Gelato 20x20cm

const PDFDocument = require('pdfkit');
const {
  componerPaginaInterior,
  componerPortada,
  componerDedicatoria,
  componerGuarda,
  componerFin,
  componerContraportada,
  PX, PY
} = require('../../pdf-engine/composer');

// Conversión mm → puntos PDF (1mm = 2.8346 pts)
const MM_TO_PT = 2.8346;
function mm(val) { return val * MM_TO_PT; }

// Tamaño página con bleed: 206mm × 206mm
const PAGE_W_PT = mm(206);
const PAGE_H_PT = mm(206);

/**
 * Genera el PDF completo
 * @param {Object} job — datos completos del job
 * @param {Object} imagenes — { portada: Buffer, spreads: [{numero, paginaIzq, paginaDer, pagIzq, pagDer}] }
 * @param {boolean} esPreview — si true, genera solo portada + 2 spreads con watermark
 * @returns {Buffer} buffer del PDF
 */
async function generarPDF(job, imagenes, esPreview = false) {
  const { titulo, dedicatoria, dedicatoriaPersonal, nombre, idioma = 'es' } = job;

  // Crear documento PDF
  const doc = new PDFDocument({
    size: [PAGE_W_PT, PAGE_H_PT],
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    autoFirstPage: false,
    info: {
      Title: titulo || 'Mi cuento StoryOwl',
      Author: 'StoryOwl',
      Creator: 'StoryOwl v1 — storyowl.com',
      Subject: `Cuento personalizado para ${nombre}`
    }
  });

  const buffers = [];
  doc.on('data', chunk => buffers.push(chunk));

  // ── Función helper: añadir imagen buffer como página ──
  async function addPageFromBuffer(imageBuffer, watermark = false) {
    doc.addPage({ size: [PAGE_W_PT, PAGE_H_PT], margins: 0 });
    doc.image(imageBuffer, 0, 0, { width: PAGE_W_PT, height: PAGE_H_PT });

    if (watermark) {
      // Watermark para preview
      doc.save();
      doc.opacity(0.22);
      doc.fontSize(28).font('Helvetica-Bold').fillColor('white');
      doc.rotate(-30, { origin: [PAGE_W_PT/2, PAGE_H_PT/2] });
      for (let i = -2; i < 4; i++) {
        doc.text('Vista previa · StoryOwl · Vista previa · StoryOwl',
          -PAGE_W_PT * 0.3, PAGE_H_PT * 0.2 + i * 60,
          { width: PAGE_W_PT * 1.6, align: 'center' }
        );
      }
      doc.restore();
    }
  }

  try {
    // ── PÁG 1: PORTADA ─────────────────────────────────
    const portadaBuffer = await componerPortada({
      imageBuffer: imagenes.portada,
      titulo
    });
    await addPageFromBuffer(portadaBuffer, esPreview);

    if (!esPreview) {
      // ── PÁG 2: GUARDA INICIAL ─────────────────────────
      const guardaBuffer = await componerGuarda();
      await addPageFromBuffer(guardaBuffer);
    }

    // ── PÁG 3 (o 2 en preview): DEDICATORIA ───────────
    const dedBuffer = await componerDedicatoria({
      nombre, dedicatoria, dedicatoriaPersonal, idioma
    });
    await addPageFromBuffer(dedBuffer, esPreview);

    // ── PÁGINAS INTERIORES (spreads) ───────────────────
    const spreadsAIncluir = esPreview
      ? imagenes.spreads.slice(0, 2)  // preview: solo 2 spreads
      : imagenes.spreads;             // libro: todos los spreads

    for (const spread of spreadsAIncluir) {
      // Página izquierda del spread
      const pagIzqBuffer = await componerPaginaInterior({
        imageBuffer: spread.paginaIzq,
        numeroPagina: spread.pagIzq?.numero || spread.numero * 2 - 1,
        titulo: spread.pagIzq?.titulo || '',
        texto: spread.pagIzq?.texto || '',
        idioma
      });
      await addPageFromBuffer(pagIzqBuffer, esPreview);

      // Página derecha del spread
      if (spread.pagDer) {
        const pagDerBuffer = await componerPaginaInterior({
          imageBuffer: spread.paginaDer,
          numeroPagina: spread.pagDer?.numero || spread.numero * 2,
          titulo: spread.pagDer?.titulo || '',
          texto: spread.pagDer?.texto || '',
          idioma
        });
        await addPageFromBuffer(pagDerBuffer, esPreview);
      }
    }

    if (!esPreview) {
      // ── PÁG FIN ────────────────────────────────────────
      const finBuffer = await componerFin({ nombre, idioma });
      await addPageFromBuffer(finBuffer);

      // ── PÁG CONTRAPORTADA INTERIOR ─────────────────────
      const contraBuffer = await componerContraportada({ idioma });
      await addPageFromBuffer(contraBuffer);

      // ── PÁGINAS DE RELLENO hasta 30 ────────────────────
      // Calcular cuántas páginas llevamos:
      // 1 portada + 1 guarda + 1 dedicatoria + 18 páginas historia
      // + 1 fin + 1 contraportada = 23 páginas → añadir 7 guardas hasta 30
      const paginasActuales = 23;
      const paginasFaltantes = 30 - paginasActuales;
      const guardaBuffer2 = await componerGuarda();
      for (let i = 0; i < paginasFaltantes; i++) {
        await addPageFromBuffer(guardaBuffer2);
      }
    }

  } catch(e) {
    console.error('[pdfWorker] Error generando PDF:', e.message);
    throw e;
  }

  // Finalizar PDF
  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

module.exports = { generarPDF };
