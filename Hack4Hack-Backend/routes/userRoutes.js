import express from "express";
import checkAuth from "../middlewares/authMiddleware.js";
import {
  login,
  register,
  getCurrentUser,
  logout,
} from "../controllers/userController.js";
import rateLimiter from "../middlewares/rateLimiter.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

router.post(
  "/register",
  // rateLimiter({ limit: 5, window: 60 }),
  asyncHandler(register),
);

router.post(
  "/login",
  // rateLimiter({ limit: 10, window: 60 }),
  asyncHandler(login),
);

router.get("/me", checkAuth, asyncHandler(getCurrentUser));
router.post("/logout", checkAuth, asyncHandler(logout));

export default router;
