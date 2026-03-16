import express from "express";
import extractionReviewApi from "./extractionReview.js";
import packetBuilderApi from "./packetBuilder.js";
import bindFlowApi from "./bindFlow.js";

const router = express.Router();

router.use(extractionReviewApi);
router.use(packetBuilderApi);
router.use(bindFlowApi);

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

router.get("/operator/bind", async (_req, res) => {
  res.render("operator/bind-queue", {});
});

router.get("/operator/bind/:quoteId", async (req, res) => {
  res.render("operator/bind-detail", {
    quoteId: req.params.quoteId,
  });
});

export default router;

