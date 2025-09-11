// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
// inline helpers
const yn = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (v === true || ["y","yes","true","1","on","checked"].includes(s)) return "Y";
  if (v === false || ["n","no","false","0"].includes(s)) return "N";
  return "";
};
const money = (v) => {
  if (v === 0) return "0.00";
  if (v == null || v === "") return "";
  const n = Number(v); if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
};
const formatDate = (d=new Date()) => {
  const dt = (d instanceof Date) ? d : new Date(d);
  const mm = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${mm}/${dd}/${dt.getFullYear()}`;
};
const ck = (v) => (yn(v) === "Y" ? "X" : "");

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
  const html = await ejs.render(templateStr, {
  // data aliases you already have:
  ...data,         // flattened
  data,            // nested
  formData: data,  // legacy

  // css
  styles: cssStr,

  // inline helpers (existing)
const yn = (v) => { /* ... */ };
const money = (v) => { /* ... */ };
const formatDate = (d=new Date()) => { /* ... */ };
const ck = (v) => (yn(v) === "Y" ? "X" : "");

// NEW helpers — put these right after ck
const isYes = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || v === 1 || ["y","yes","true","1","on","checked"].includes(s);
};
const moneyUSD = (v) => {
  const s = money(v);
  return s ? `$${s}` : "";
};
const join = (parts, sep=", ") => {
  const arr = Array.isArray(parts) ? parts : [parts];
  return arr.filter(x => x != null && String(x).trim() !== "").join(sep);
};

// ...

const html = await ejs.render(
  templateStr,
  {
    // data aliases
    ...data,
    data,
    formData: data,

    // css
    styles: cssStr,

    // expose helpers to EJS
    yn, money, formatDate, ck,
    isYes, moneyUSD, join,
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
    await page.setContent(html, { waitUntil: "load" }); // was "networkidle0"
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
