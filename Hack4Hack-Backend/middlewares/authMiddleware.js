import mongoose from "mongoose";
import redisClient from "../config/redis.js";

export default async function checkAuth(req, res, next) {
  // Support session ID from signed cookies or Authorization header (Bearer <token>)
  let sessionId = req.signedCookies?.uid;

  if (!sessionId && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      sessionId = parts[1];
    }
  }

  if (!sessionId) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  let session = null;
  try {
    const stored = await redisClient.get(`session:${sessionId}`);
    session = stored ? JSON.parse(stored) : null;
  } catch (err) {
    console.error("Auth session lookup error:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Authentication service error" });
  }

  if (!session || !session.user) {
    return res
      .status(401)
      .json({ success: false, error: "Session expired or invalid" });
  }

  req.user = {
    _id: new mongoose.Types.ObjectId(session.user._id),
    email: session.user.email,
    role: session.user.role || session.user.globalRole || "Participant",
    globalRole: session.user.globalRole || session.user.role || "Participant",
    name: session.user.name,
    teamId: session.user.teamId
      ? new mongoose.Types.ObjectId(session.user.teamId)
      : null,
  };

  next();
}
