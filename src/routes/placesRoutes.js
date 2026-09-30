import express from "express";
import {
  getPlacesPublicConfig,
  placesAutocomplete,
  placesDetails,
} from "../services/placesService.js";

const router = express.Router();

router.get("/api/places/config", (_req, res) => {
  return res.json(getPlacesPublicConfig());
});

router.post("/api/places/autocomplete", async (req, res) => {
  try {
    const result = await placesAutocomplete(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[places autocomplete] error:", err);
    return res.status(500).json({
      ok: false,
      error: "PLACES_AUTOCOMPLETE_ERROR",
      message: "Address lookup failed.",
    });
  }
});

router.post("/api/places/details", async (req, res) => {
  try {
    const result = await placesDetails(req.body || {});
    return res.status(result.status || 200).json(result);
  } catch (err) {
    console.error("[places details] error:", err);
    return res.status(500).json({
      ok: false,
      error: "PLACES_DETAILS_ERROR",
      message: "Address lookup failed.",
    });
  }
});

export default router;
