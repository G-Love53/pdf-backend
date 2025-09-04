import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { renderPdf } from "./pdf.js";
import { sendWithGmail } from "./email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TPL_DIR = path.join(__dirname, "..", "templates");

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.post("/render-bundle", async (req, res) => {
  const { templates = [], email } = req.body;
  if (!Array.isArray(templates) || templates.length === 0) {
    return res.status(400).json({ ok: false, error: "NO_TEMPLATES" });
  }

  // Render ALL first (strict)
  const results = await Promise.allSettled(
    templates.map(async (t) => {
      const htmlPath = path.join(TPL_DIR, t.name, "index.ejs");
      const cssPath  = path.join(TPL_DIR, t.name, "styles.css");
      const buffer   = await renderPdf({ htmlPath, cssPath, data: t.data });
      return { filename: t.filename || `${t.name}.pdf`, buffer };
    })
  );

  const failures = results.filter(r => r.status === "rejected");
  if (failures.length) {
    console.error("RENDER_FAILURES", failures.map(f => String(f.reason)));
    return res.status(500).json({
      ok: false,
      error: "ONE_OR_MORE_ATTACHMENTS_FAILED",
      failedCount: failures.length
    });
  }

  const attachments = results.map(r => r.value);

  if (email?.to?.length) {
    await sendWithGmail({ to: email.to, subject: email.subject, html: email.bodyHtml, attachments });
    return res.json({ ok: true, sent: true, count: attachments.length });
  }

  // Non-email testing path: stream the first PDF
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${attachments[0].filename}"`);
  res.send(attachments[0].buffer);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`PDF service listening on ${PORT}`));

