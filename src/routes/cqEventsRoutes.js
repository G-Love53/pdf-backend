import express from "express";
import {
  markStalePageViewsWithoutEngaged,
  recordCqEvent,
} from "../services/cqEventsService.js";

const router = express.Router();

function parseEventBody(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    body = body.toString("utf8");
  }
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (body && typeof body === "object") return body;
  return {};
}

router.post(
  "/api/cq/events",
  express.raw({ type: () => true, limit: "32kb" }),
  async (req, res) => {
    try {
      const body = parseEventBody(req);
      if (body === null) {
        return res.status(400).json({ ok: false, error: "INVALID_JSON" });
      }

      const result = await recordCqEvent(body, {
        userAgent: req.headers["user-agent"],
        referrer: req.headers.referer || req.headers.referrer,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json({
          ok: false,
          error: result.error,
        });
      }
      return res.status(204).end();
    } catch (err) {
      console.error("[cq/events] error:", err);
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  },
);

export default router;

export function startCqEventsBotJanitor() {
  const run = () => {
    markStalePageViewsWithoutEngaged().catch((err) => {
      console.warn("[cq/events] bot janitor:", err.message);
    });
  };
  run();
  setInterval(run, 60_000);
}
