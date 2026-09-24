/**
 * Public Partner Layer — intake fetches a card to co-brand ConnectQuote.
 * No notes, no inactive rows.
 */

import express from "express";
import { publicPartnerCard } from "../config/cidPartners.js";

const router = express.Router();

router.get("/api/partners/:id", (req, res) => {
  const card = publicPartnerCard(req.params.id);
  if (!card) {
    return res.status(404).json({ ok: false, error: "unknown_partner" });
  }
  return res.json({ ok: true, partner: card });
});

export default router;
