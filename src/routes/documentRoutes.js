/**
 * Document download via API — presigned R2 redirect (no public bucket DNS).
 */
import express from "express";
import { getPool } from "../db.js";
import { getPresignedGetObjectUrl } from "../services/r2Service.js";
import { parseOptionalUuid } from "../utils/uuid.js";
import { StorageProvider } from "../constants/postgresEnums.js";

const router = express.Router();

router.get("/api/documents/:documentId/download", async (req, res) => {
  const documentId = parseOptionalUuid(req.params.documentId);
  if (!documentId) {
    return res.status(400).json({ error: "invalid_document_id" });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: "database_not_configured" });
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT document_id, storage_path, storage_provider
        FROM documents
        WHERE document_id = $1
        LIMIT 1
      `,
      [documentId],
    );

    if (!rows.length) {
      return res.status(404).json({ error: "not_found" });
    }

    const row = rows[0];
    if (row.storage_provider !== StorageProvider.R2) {
      return res.status(501).json({ error: "storage_provider_not_supported" });
    }

    if (!row.storage_path) {
      return res.status(404).json({ error: "missing_storage_path" });
    }

    const url = await getPresignedGetObjectUrl(row.storage_path, {
      expiresIn: 900,
    });

    return res.redirect(302, url);
  } catch (err) {
    console.error("[documents/download] error:", err.message || err);
    return res.status(500).json({ error: "presign_failed" });
  }
});

export default router;
