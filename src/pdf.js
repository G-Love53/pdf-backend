// src/pdf.js
import fs from "fs/promises";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helpers available in EJS templates
const helpers = {
  yn(v) {
    const s = String(v ?? "").trim().toLowerCase();
    if (v === true || s === "true" || s === "yes" || s === "y" || s === "1") return "Yes";
    if (v === false || s === "false" || s === "no" || s === "n" || s === "0") return "No";
    // fallback: non-empty string => Yes, empty => ""
    return s ? "Yes" : "";
  },

  ck(v, target) {
    const want = String(target ?? "").trim().toLowerCase();
    if (Array.isArray(v)) {
      return v.some(x => String(x ?? "").trim().toLowerCase() === want) ? "✓" : "";
    }
    return String(v ?? "").trim().toLowerCase() === want ? "✓" : "";
  },

  money(v, { decimals = 0 } = {}) {
    if (v == null || v === "") return "";
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    if (!isFinite(n)) return String(v);
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(n);
  }
};

// Render a single PDF from one template folder
//   htmlPath: .../templates/<name>/index.ejs
//   cssPath:  .../templates/<name>/styles.css (optional)
//   data:     object with template variables
export async function renderPdf({ htmlPath, cssPath, data = {} }) {
  // Load template + css (css is optional)
  const [templateStr, cssStr] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8").catch(() => "")
  ]);

  // Render HTML with helpers injected; expose both flattened keys and `data`
  let html;
  try {
    html = await ejs.render(
      templateStr,
      { ...data, data, styles: cssStr, ...helpers },
      { async: true, filename: htmlPath } // improves EJS error line numbers
    );
  } catch (err) {
    // Bubble up a concise error that includes which template failed
    const short = `${path.basename(path.dirname(htmlPath))}/index.ejs: ${err.message}`;
    throw new Error(short);
  }

  // Launch the Chrome we installed via @puppeteer/browsers (Dockerfile)
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



