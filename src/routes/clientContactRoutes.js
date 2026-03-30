import express from "express";
import { updatePrimaryEmailBySubmissionPublicId } from "../services/clientContactService.js";

const router = express.Router();

/**
 * PATCH /api/submissions/:submissionPublicId/contact-email
 * Body: { new_email, reason?, agent_id? }
 *
 * Updates clients.primary_email for the client linked to this submission.
 * submission_public_id (CID token) is never changed.
 * Audit: timeline_events client.primary_email_updated
 */
router.patch(
  "/api/submissions/:submissionPublicId/contact-email",
  async (req, res) => {
    const { submissionPublicId } = req.params;
    const { new_email, reason, agent_id } = req.body || {};

    if (!new_email || typeof new_email !== "string") {
      return res.status(400).json({ ok: false, error: "missing_new_email" });
    }

    try {
      const result = await updatePrimaryEmailBySubmissionPublicId(
        decodeURIComponent(submissionPublicId),
        {
          newEmail: new_email,
          reason: reason || null,
          actorId: agent_id || "operator",
        },
      );

      return res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      const code = err.code || err.message;
      if (code === "invalid_email") {
        return res.status(400).json({ ok: false, error: "invalid_email" });
      }
      if (code === "submission_not_found") {
        return res.status(404).json({ ok: false, error: "submission_not_found" });
      }
      if (code === "email_already_in_use") {
        return res.status(409).json({
          ok: false,
          error: "email_already_in_use",
          conflicting_client_id: err.conflicting_client_id || null,
        });
      }
      console.error("[clientContact] update error:", err.message || err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  },
);

export default router;
