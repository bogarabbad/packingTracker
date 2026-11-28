const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');

const DEFAULT_ANCHO_MM = 100;
const DEFAULT_ALTO_MM = 70;
const MIN_MM = 20;
const MAX_MM = 200;

function mmToPt(mm) {
  return (mm * 72) / 25.4;
}

function clampMm(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_MM || rounded > MAX_MM) {
    return fallback;
  }
  return rounded;
}

function formatCreadoEn(value) {
  if (!value) {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Genera un PDF de etiqueta de lote.
 * El código de barras Code128 codifica solo el ID numérico (escaneable).
 * @param {{
 *   ID: number,
 *   TIPO_CODIGO: string,
 *   TIPO_NOMBRE: string,
 *   PADRE_ID: number|null,
 *   CREADO_EN: string|Date,
 * }} lote
 * @param {{ anchoMm?: number, altoMm?: number }} [options]
 * @returns {Promise<Buffer>}
 */
async function buildLoteEtiquetaPdf(lote, options = {}) {
  const anchoMm = clampMm(options.anchoMm, DEFAULT_ANCHO_MM);
  const altoMm = clampMm(options.altoMm, DEFAULT_ALTO_MM);
  const pageWidth = mmToPt(anchoMm);
  const pageHeight = mmToPt(altoMm);
  const margin = Math.max(4, Math.min(pageWidth, pageHeight) * 0.06);
  const contentWidth = pageWidth - margin * 2;
  const scale = Math.min(pageWidth / mmToPt(DEFAULT_ANCHO_MM), pageHeight / mmToPt(DEFAULT_ALTO_MM));

  const titleSize = Math.max(7, 11 * scale);
  const idSize = Math.max(12, 26 * scale);
  const bodySize = Math.max(6, 9 * scale);
  const barcodeHeightMm = Math.max(6, Math.min(altoMm * 0.28, 16));
  const barcodeWidth = Math.max(40, contentWidth * 0.92);

  const idText = String(lote.ID);
  const barcodePng = await bwipjs.toBuffer({
    bcid: 'code128',
    text: idText,
    scale: Math.max(2, Math.round(3 * scale)),
    height: barcodeHeightMm,
    includetext: true,
    textxalign: 'center',
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [pageWidth, pageHeight],
      margin,
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(titleSize).text('ETIQUETA DE LOTE', {
      width: contentWidth,
      align: 'center',
    });
    doc.moveDown(0.2 * scale);
    doc.fontSize(idSize).text(idText, {
      width: contentWidth,
      align: 'center',
    });

    const barcodeX = margin + (contentWidth - barcodeWidth) / 2;
    const barcodeY = doc.y + Math.max(2, 4 * scale);
    const barcodeDrawHeight = mmToPt(barcodeHeightMm + 4);
    doc.image(barcodePng, barcodeX, barcodeY, {
      width: barcodeWidth,
      height: barcodeDrawHeight,
    });

    let y = barcodeY + barcodeDrawHeight + Math.max(2, 4 * scale);
    const maxY = pageHeight - margin;
    doc.font('Helvetica').fontSize(bodySize);

    const lines = [
      `Tipo: ${lote.TIPO_CODIGO} · ${lote.TIPO_NOMBRE}`,
      lote.PADRE_ID == null ? 'Padre: —' : `Padre: #${lote.PADRE_ID}`,
      `Creado: ${formatCreadoEn(lote.CREADO_EN)}`,
    ];

    for (const line of lines) {
      if (y + bodySize > maxY) {
        break;
      }
      doc.text(line, margin, y, { width: contentWidth });
      y = doc.y + Math.max(1, 2 * scale);
    }

    doc.end();
  });
}

module.exports = {
  buildLoteEtiquetaPdf,
  DEFAULT_ANCHO_MM,
  DEFAULT_ALTO_MM,
  MIN_MM,
  MAX_MM,
};
