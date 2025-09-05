// src/pdf.js
import ejs from "ejs";
import fs from "fs/promises";
import puppeteer from "puppeteer";

export async function renderPdf({ htmlPath, cssPath, data }) {
  let styles = "";
  try {
    styles = await fs.readFile(cssPath, "utf8");
  } catch {
    // If no CSS file exists for this template, continue with empty styles
  }

  // Render the HTML with EJS, injecting styles into the template
  const html = await ejs.renderFile(
    htmlPath,
    { ...data, styles },
    { async: true }
  );

  // Launch Puppeteer in container-friendly mode
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();
  return pdfBuffer;
}

