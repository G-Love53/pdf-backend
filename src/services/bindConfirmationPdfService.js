import ejs from "ejs";
import path from "path";
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "url";
import { getSegmentBranding } from "../config/segmentBranding.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatMoney(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "0.00";
}

export async function buildBindConfirmationPdf({
  segment,
  submissionPublicId,
  client,
  quote,
  paymentMethod,
}) {
  const branding = getSegmentBranding(segment);
  const templateFile = path.join(
    __dirname,
    "../templates/binds/shared/bind-confirmation/index.ejs",
  );

  const viewModel = {
    ...branding,
    segment: String(segment || "bar").toLowerCase(),
    submission_public_id: submissionPublicId || "",
    issued_on: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    business_name: client?.business_name || null,
    contact_name: client?.contact_name || null,
    client_email: client?.email || null,
    client_phone: client?.phone || null,
    carrier_name: quote?.carrier_name || null,
    policy_type: quote?.policy_type || null,
    annual_premium: formatMoney(quote?.annual_premium),
    effective_date: quote?.effective_date || null,
    expiration_date: quote?.expiration_date || null,
    payment_method: paymentMethod || "annual",
  };

  const html = await ejs.renderFile(templateFile, viewModel);

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    const buffer = await page.pdf({ format: "Letter", printBackground: true });
    return Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

