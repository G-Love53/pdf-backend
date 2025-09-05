// src/pdf.js
import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import puppeteer from "puppeteer-core";

const EXEC_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  "/app/chrome/linux-123.0.6312.122/chrome-linux64/chrome";

export async function renderPdf({ htmlPath, cssPath, data }) {
  // 1) Build HTML
  const [htmlTpl, css] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8").catch(() => "") // css optional
  ]);

  const html = ejs.render(htmlTpl, { data, css });

  // 2) Launch Chrome
  const browser = await puppeteer.launch({
    executablePath: EXEC_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // optional: ensure fonts fully render
    await page.evaluateHandle("document.fonts && document.fonts.ready || Promise.resolve()").catch(() => {});

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" }
    });

    return pdf;
  } finally {
    await browser.close();
  }
}
