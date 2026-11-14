import Team from "../models/teamModel.js";
import AppError from "../utils/AppError.js";

export const attachTeam = async (req, res, next) => {
  try {
    if (!req.user?._id) {
      return next(new AppError("Not authenticated", 401));
    }
    const team = await Team.findById(req.user._id).lean();
    if (!team) {
      return next(new AppError("No team associated with your account", 404));
    }
    req.team = team;
    next();
  } catch (e) {
    next(e);
  }
};
