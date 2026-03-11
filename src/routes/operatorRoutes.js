import express from "express";
import extractionReviewApi from "./extractionReview.js";

const router = express.Router();

router.use(extractionReviewApi);

router.get("/operator/extraction-review", async (_req, res) => {
  res.render("operator/extraction-queue", {});
});

router.get("/operator/extraction-review/:workQueueItemId", async (req, res) => {
  res.render("operator/extraction-review", {
    workQueueItemId: req.params.workQueueItemId,
  });
});

export default router;

