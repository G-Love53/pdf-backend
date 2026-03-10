import cron from "node-cron";
import { getPool } from "../db.js";

// Placeholder skeleton for the Gmail poller.
// This wires in a cron job without impacting the existing pipeline.

export function startGmailPoller() {
  const pool = getPool();
  if (!pool) {
    console.warn("[gmailPoller] DB not configured; poller disabled.");
    return;
  }

  // Allow override via env; default every 3 minutes.
  const schedule = process.env.GMAIL_POLL_CRON || "*/3 * * * *";

  // Opt-in switch so this never surprises production until you're ready.
  if (process.env.ENABLE_GMAIL_POLLING !== "true") {
    console.log("[gmailPoller] ENABLE_GMAIL_POLLING!=true; poller not started.");
    return;
  }

  cron.schedule(schedule, async () => {
    try {
      // This is where the Phase 4 Gmail → carrier_messages → documents → quotes logic will live.
      // For now, keep it as a no-op with a cheap heartbeat so we can evolve it safely.
      console.log("[gmailPoller] tick (polling skeleton active)");
    } catch (err) {
      console.error("[gmailPoller] error:", err.message || err);
    }
  });

  console.log(`[gmailPoller] scheduled with cron "${schedule}"`);
}

