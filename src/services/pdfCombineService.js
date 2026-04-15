import { PDFDocument, StandardFonts } from "pdf-lib";

export async function combinePDFs(pdfBuffers) {
  const mergedDoc = await PDFDocument.create();

  for (const buffer of pdfBuffers) {
    if (!buffer || buffer.length === 0) continue;
    const doc = await PDFDocument.load(buffer);
    const pages = await mergedDoc.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => mergedDoc.addPage(page));
  }

  const out = await mergedDoc.save();
  return Buffer.from(out);
}

function parsePngDataUri(dataUri) {
  const s = String(dataUri || "");
  const m = s.match(/^data:image\/png;base64,(.+)$/i);
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

export async function createSimplePagePdf(lines = [], options = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  const logoPng = parsePngDataUri(options.logoDataUri);
  if (logoPng) {
    try {
      const img = await doc.embedPng(logoPng);
      const maxWidth = Number(options.logoMaxWidth || 210);
      const maxHeight = Number(options.logoMaxHeight || 70);
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const x = (width - drawW) / 2;
      const yTop = Number(options.logoTop || 54);
      const y = height - yTop - drawH;
      page.drawImage(img, { x, y, width: drawW, height: drawH });
    } catch {
      // Ignore logo draw failures so letter generation remains robust.
    }
  }

  let y = Number(options.textStartY || height - 72);
  lines.forEach((line) => {
    page.drawText(String(line ?? ""), {
      x: 72,
      y,
      size: fontSize,
      font,
      color: undefined,
    });
    y -= fontSize + 4;
  });

  const out = await doc.save();
  return Buffer.from(out);
}

