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

export async function createSimplePagePdf(lines = []) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 12;

  let y = height - 72;
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

