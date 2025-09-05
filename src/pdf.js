// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Render a single PDF from one template folder
//   htmlPath: .../templates/<name>/index.ejs
//   cssPath:  .../templates/<name>/styles.css (optional)
//   data:     object with template variables
export async function renderPdf({ htmlPath, cssPath, data = {} }) {
  // Load template + css (css optional)
  const [templateStr, cssStr] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8").catch(() => "")
  ]);

  // Render HTML, exposing `styles` to the EJS template
  const html = await ejs.render(
    templateStr,
    { ...data, data, styles: cssStr },
    { async: true, filename: htmlPath } // filename helps EJS error messages show the correct file/line
  );

  // Launch Chrome that we installed via @puppeteer/browsers (Dockerfile)
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      "/app/chrome/linux-123.0.6312.122/chrome-linux64/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--font-render-hinting=none",
      "--disable-dev-shm-usage"
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" }
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

