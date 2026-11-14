import express from "express";
import checkAuth from "../middlewares/authMiddleware.js";
import { attachTeam } from "../middlewares/attachTeam.js";
import { getMyTeam } from "../controllers/teamController.js";
import rateLimiter from "../middlewares/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

router.get(
  "/me",
  checkAuth,
  attachTeam,
  // rateLimiter({ limit: 60, window: 60 }),
  asyncHandler(getMyTeam),
);

export default router;
