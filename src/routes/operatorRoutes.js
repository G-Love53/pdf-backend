import express from "express";
import extractionReviewApi from "./extractionReview.js";
import packetBuilderApi from "./packetBuilder.js";

const router = express.Router();

router.use(extractionReviewApi);
router.use(packetBuilderApi);

router.get("/operator/extraction-review", async (_req, res) => {
  res.render("operator/extraction-queue", {});
});

router.get("/operator/extraction-review/:workQueueItemId", async (req, res) => {
  res.render("operator/extraction-review", {
    workQueueItemId: req.params.workQueueItemId,
  });
});

router.get("/operator/packet-builder", async (_req, res) => {
  res.render("operator/packet-queue", {});
});

router.get("/operator/packet-builder/:quoteId", async (req, res) => {
  res.render("operator/packet-detail", {
    quoteId: req.params.quoteId,
  });
});

export default router;

