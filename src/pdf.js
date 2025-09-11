// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";

/* ---------- inline helpers made available to EJS ---------- */
const yn = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (v === true || ["y","yes","true","1","on","checked"].includes(s)) return "Y";
  if (v === false || ["n","no","false","0"].includes(s)) return "N";
  return "";
};
const money = (v) => {
  if (v === 0) return "0.00";
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const moneyUSD = (v) => {
  const s = money(v);
  return s ? `$${s}` : "";
};
const formatDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${dt.getFullYear()}`;
};
const ck = (v) => (yn(v) === "Y" ? "X" : "");
const isYes = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return v === true || v === 1 || ["y","yes","true","1","on","checked"].includes(s);
};
const yesno = (v) => (yn(v) === "Y" ? "Yes" : (yn(v) === "N" ? "No" : ""));
const isyes = (v) => isYes(v); // alias to satisfy lowercase calls

const join = (parts, sep = ", ") => {
  const arr = Array.isArray(parts) ? parts : [parts];
  return arr.filter(x => x != null && String(x).trim() !== "").join(sep);
};

/* ---------- module path helpers ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- main renderer ---------- */
export async function renderPdf({ htmlPath, cssPath, data = {} }) {
  // Load template + optional CSS
  const [templateStr, cssStr] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath ?? "", "utf8").catch(() => "")
  ]);

  // Render EJS -> HTML (expose helpers and styles)
  const html = await ejs.render(
    templateStr,
    {
      ...data,          // flattened access
      data,             // nested access
      formData: data,   // legacy alias
      styles: cssStr,   // used by <style><%= styles %></style>

      // helpers available directly in EJS
      yn, money, moneyUSD, formatDate, ck, isYes, join, yesno, isyes
    },
    { async: true, filename: htmlPath }
  );

  // Launch Chrome (path provided by Dockerfile env var)
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/app/chrome/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none", "--disable-dev-shm-usage"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
