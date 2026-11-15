import mongoose from "mongoose";
import Hackathon from "../models/hackathonModel.js";
import AppError from "../utils/AppError.js";

export const getDeadlineConfig = async () => {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError("Hackathon configuration is unavailable", 503);
  }

  const activeHackathon = await Hackathon.findOne({ isActive: true }).lean();
  if (!activeHackathon) return null;

  const deadlineTime = new Date(activeHackathon.deadlineAt).getTime();
  const graceSeconds = activeHackathon.gracePeriodSeconds ?? 300;
  if (!Number.isFinite(deadlineTime) || !Number.isFinite(graceSeconds) || graceSeconds < 0) {
    throw new Error("The active hackathon has invalid deadline settings");
  }

  const gracePeriodMs = graceSeconds * 1000;
  return {
    hackathon: activeHackathon,
    deadlineTime,
    gracePeriodMs,
    hardCutoffTime: deadlineTime + gracePeriodMs,
  };
};

export const enforceDeadline = async (req, res, next) => {
  try {
    const config = await getDeadlineConfig();
    if (!config) {
      return next(new AppError("The organizer has not started the hackathon yet", 403));
    }
    const { deadlineTime } = config;
    if (Date.now() > deadlineTime) {
      return next(new AppError("New uploads must start before the submission deadline.", 403));
    }
    next();
  } catch (error) {
    next(error);
  }
};
