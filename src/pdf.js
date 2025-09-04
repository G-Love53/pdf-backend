import fs from "fs/promises";
import ejs from "ejs";
import puppeteer from "puppeteer";

export async function renderPdf({ htmlPath, cssPath, data, options = {} }) {
  const [htmlTpl, css] = await Promise.all([
    fs.readFile(htmlPath, "utf8"),
    fs.readFile(cssPath, "utf8")
  ]);

  const html = await ejs.render(htmlTpl, { data, styles: css }, { async: true });

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("print");
    return await page.pdf({
      format: options.pageFormat || "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" }
    });
  } finally {
    await browser.close();
  }
}

