import mongoose from "mongoose";
import Hackathon from "../models/hackathonModel.js";
import AppError from "../utils/AppError.js";

const DEFAULT_DEADLINE_ISO = "2026-11-15T18:29:00.000Z";

export const getDeadlineConfig = async () => {
  // Only query DB if mongoose connection is established
  if (mongoose.connection.readyState === 1) {
    try {
      const activeHackathon = await Hackathon.findOne({ isActive: true }).lean();
      if (activeHackathon && activeHackathon.deadlineAt) {
        const deadlineTime = new Date(activeHackathon.deadlineAt).getTime();
        const graceSeconds = activeHackathon.gracePeriodSeconds ?? 300;
        if (Number.isFinite(deadlineTime) && Number.isFinite(graceSeconds) && graceSeconds >= 0) {
          const gracePeriodMs = graceSeconds * 1000;
          return { deadlineTime, gracePeriodMs, hardCutoffTime: deadlineTime + gracePeriodMs };
        }
      }
    } catch (err) {
      console.warn("Could not load Hackathon deadline from DB, falling back to ENV:", err.message);
    }
  }

  // Fallback to environment variables or default 24h
  const deadlineIso = process.env.SUBMISSION_DEADLINE_ISO || DEFAULT_DEADLINE_ISO;
  const deadlineTime = new Date(deadlineIso).getTime();

  const configuredGrace = Number(process.env.SUBMISSION_GRACE_PERIOD_SECONDS);
  const gracePeriodSeconds = Number.isFinite(configuredGrace) && configuredGrace >= 0 ? configuredGrace : 300;
  const gracePeriodMs = gracePeriodSeconds * 1000;
  if (!Number.isFinite(deadlineTime)) throw new Error("SUBMISSION_DEADLINE_ISO must be a valid date");

  return {
    deadlineTime,
    gracePeriodMs,
    hardCutoffTime: deadlineTime + gracePeriodMs,
  };
};

export const enforceDeadline = async (req, res, next) => {
  try {
    const { deadlineTime } = await getDeadlineConfig();
    if (Date.now() > deadlineTime) {
      return next(new AppError("New uploads must start before the submission deadline.", 403));
    }
    next();
  } catch (error) {
    next(error);
  }
};
