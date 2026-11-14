import express from "express";
import checkAuth from "../middlewares/authMiddleware.js";
import { attachTeam } from "../middlewares/attachTeam.js";
import {
  createSubmission,
  getSubmissionStatus,
  getSubmissionVersions,
  getSubmissionVersionById,
} from "../controllers/submissionController.js";
import rateLimiter from "../middlewares/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

// Every submission endpoint needs an authenticated user and their team.
router.use(checkAuth, attachTeam);

router.post(
  "/",
  rateLimiter({ limit: 20, window: 60 }),
  asyncHandler(createSubmission),
);

router.get(
  "/status",
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(getSubmissionStatus),
);

router.get(
  "/versions",
  // rateLimiter({ limit: 30, window: 60 }),
  asyncHandler(getSubmissionVersions),
);

router.get(
  "/versions/:versionId",
  // rateLimiter({ limit: 30, window: 60 }),
  asyncHandler(getSubmissionVersionById),
);

export default router;
