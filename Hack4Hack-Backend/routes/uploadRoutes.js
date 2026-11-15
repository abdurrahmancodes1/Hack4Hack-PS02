import express from "express";
import checkAuth from "../middlewares/authMiddleware.js";
import { attachTeam } from "../middlewares/attachTeam.js";
import {
  initiateUpload,
  signPart,
  completeUpload,
  abortUpload,
  getUploadStatus,
} from "../controllers/uploadController.js";
import rateLimiter from "../middlewares/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

// Every upload endpoint needs an authenticated user and their team.
router.use(checkAuth, attachTeam);

router.post(
  "/multipart/initiate",
  rateLimiter({ limit: 10, window: 60 }),
  asyncHandler(initiateUpload),
);

router.get("/multipart/:fileId", asyncHandler(getUploadStatus));

router.post(
  "/multipart/sign-part",
  rateLimiter({ limit: 120, window: 60 }),
  asyncHandler(signPart),
);

router.post(
  "/multipart/complete",
  rateLimiter({ limit: 10, window: 60 }),
  asyncHandler(completeUpload),
);

router.post(
  "/multipart/abort",
  rateLimiter({ limit: 10, window: 60 }),
  asyncHandler(abortUpload),
);

export default router;
