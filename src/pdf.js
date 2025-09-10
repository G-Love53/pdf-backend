// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import helpers from "../utils/helpers.js";
const { ck, yn, money, formatDate } = helpers;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Render a single PDF from one template folder
 *  - htmlPath: .../templates/<name>/index.ejs
 *  - cssPath:  .../templates/<name>/styles.css (optional)
 *  - data:     object with template variables
 */
export async function renderPdf({ htmlPath, cssPath, data = {} }) {
  // Load EJS template + optional CSS
  const [templateStr, cssStr] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8").catch(() => "")
  ]);

  // Render HTML (expose both flattened keys and `data`, plus helpers + inline CSS)
  const html = await ejs.render(
  templateStr,
  {
    // data aliases
    ...data,            // flattened: <%= applicant_name %>
    data,               // nested:    <%= data.applicant_name %>
    formData: data,     // legacy:    <%= formData.applicant_name %>

    // styles
    styles: cssStr,

    // helpers available BOTH ways:
    helpers,            // <%= helpers.yn(...) %>
    ...helpers          // <%= yn(...) %>  (old templates)
  },
  { async: true, filename: htmlPath }
);


  // Launch the Chrome we install in Docker via @puppeteer/browsers
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath:
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "/app/chrome/chrome-linux64/chrome",
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
  printBackground: true,
  preferCSSPageSize: true   // <-- let @page in CSS own size + margins
  // no "format", no "margin" here
});

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
