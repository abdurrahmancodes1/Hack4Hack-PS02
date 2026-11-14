import express from "express";
import checkAuth from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";
import {
  listSubmissions,
  getSubmissionDetails,
  getAuditLogs,
  exportSubmissionsCsv,
  disqualifyTeam,
  getOrganizerStats,
  getSubmissionDownloadUrl,
} from "../controllers/organizerController.js";
import rateLimiter from "../middlewares/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";
import { setHackathonDeadline } from "../controllers/organizerController.js";

const router = express.Router();

const validateObjectIdParam = (param) => (req, res, next, value) => {
  if (!/^[a-f\d]{24}$/i.test(value)) {
    return res.status(400).json({ success: false, message: `Invalid ${param}` });
  }
  next();
};
router.param("id", validateObjectIdParam("ID"));
router.param("teamId", validateObjectIdParam("team ID"));

// All organizer endpoints require Organizer (or Admin) role.
router.use(checkAuth);
router.use(authorizeRoles("Organizer", "Admin"));

router.post(
  "/hackathon",
  rateLimiter({ limit: 5, window: 60 }),
  asyncHandler(setHackathonDeadline),
);

router.get(
  "/stats",
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(getOrganizerStats),
);

router.get(
  "/submissions",
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(listSubmissions),
);

router.get(
  "/submissions/:id",
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(getSubmissionDetails),
);

router.get(
  "/submissions/:id/download",
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(getSubmissionDownloadUrl),
);

router.get(
  "/audit-logs",
  // rateLimiter({ limit: 30, window: 60 }),
  asyncHandler(getAuditLogs),
);

router.get(
  "/export/csv",
  // rateLimiter({ limit: 5, window: 60 }),
  asyncHandler(exportSubmissionsCsv),
);

router.post(
  "/teams/:teamId/disqualify",
  // rateLimiter({ limit: 10, window: 60 }),
  asyncHandler(disqualifyTeam),
);

export default router;
