// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- helpers available inside EJS -----
function yn(input) {
  const v = String(input ?? "").trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "y" || v === "on" || v === "1") return "Yes";
  if (v === "false" || v === "no" || v === "n" || v === "off" || v === "0") return "No";
  // treat any non-empty value as Yes, empty as No
  return input ? "Yes" : "No";
}

function ck(value, expected) {
  const exp = String(expected ?? "").trim().toLowerCase();
  if (Array.isArray(value)) {
    return value.some(v => String(v ?? "").trim().toLowerCase() === exp) ? "✓" : "";
  }
  const got = String(value ?? "").trim().toLowerCase();
  return got === exp ? "✓" : "";
}

function money(input, { decimals = 0 } = {}) {
  // Accept numbers or strings like "$200,000"
  const num = Number(String(input ?? "").replace(/[^0-9.-]/g, ""));
  if (!isFinite(num)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num);
}
// ---------------------------------------

// Render a single PDF from one template folder
//   htmlPath: .../templates/<name>/index.ejs
//   cssPath:  .../templates/<name>/styles.css (optional)
//   data:     object with template variables
export async function renderPdf({ htmlPath, cssPath, data = {} }) {
  const [templateStr, cssStr] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8").catch(() => "")
  ]);

  // Expose BOTH flattened fields and the whole object as `data`,
  // plus the helper functions and inline CSS.
  const html = await ejs.render(
    templateStr,
    { ...data, data, styles: cssStr, yn, ck, money },
    { async: true, filename: htmlPath }
  );

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


