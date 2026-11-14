import mongoose from "mongoose";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js"; // ← Bug 2
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import redisClient from "../config/redis.js";
import { loginSchema, registerSchema } from "../validators/authSchema.js";
import AppError from "../utils/AppError.js";

const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

// Team IDs intentionally match participant user IDs. Concurrent registration
// or first-login requests can both observe a missing team, so treat the unique
// _id index as the final guard and accept the request if the other request won.
const ensureParticipantTeam = async (user) => {
  try {
    await Team.updateOne(
      { _id: user._id },
      {
        $setOnInsert: {
          name: `${user.name}'s team`,
          createdBy: user._id,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000 || !(await Team.exists({ _id: user._id }))) {
      throw error;
    }
  }
};

export const register = async (req, res) => {
  const { success, data } = registerSchema.safeParse(req.body);
  if (!success) throw new AppError("Invalid input", 400);

  const { name, email, password, role } = data;

  const existingUser = await User.findOne({ email });
  if (existingUser) throw new AppError("This email already exists", 409);

  // The registration form lets the user choose Participant or Organizer.
  const assignedRole = role || "Participant";
  const hashedPassword = await bcrypt.hash(password, 12);

  // 1. Create the user first.
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    globalRole: assignedRole,
    role: assignedRole,
  });

  // 2. Ensure the user's team. teamId === userId by design.
  if (assignedRole === "Participant") {
    await ensureParticipantTeam(user);
  }

  // 3. Build the session.
  const sessionId = crypto.randomUUID();
  const redisKey = `session:${sessionId}`;
  const sessionPayload = {
    user: {
      _id: user._id.toString(),
      email: user.email,
      role: assignedRole,
      globalRole: assignedRole,
      name: user.name,
    },
  };

  await redisClient.setEx(redisKey, SESSION_EXPIRY_SECONDS, JSON.stringify(sessionPayload));
  await redisClient.sAdd(`user_session:${user._id}`, sessionId);

  res.cookie("uid", sessionId, {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRY_SECONDS * 1000,
  });

  return res.status(201).json({
    success: true,
    message: "User registered successfully",
    userId: user._id,
    token: sessionId,
    sessionId,
    user: sessionPayload.user,
  });
};
export const login = async (req, res) => {
  const { success, data } = loginSchema.safeParse(req.body);
  if (!success) throw new AppError("Invalid input", 400);

  const { email, password, role } = data;
  const user = await User.findOne({ email }).lean();

  if (!user) throw new AppError("Invalid credentials", 401);
  if (user.deleted) throw new AppError("Account is deactivated", 403);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new AppError("Invalid credentials", 401);

  const rawRole = user.globalRole || user.role || "Participant";
  const actualRole =
    rawRole === "Organizer" || rawRole === "Admin"
      ? "Organizer"
      : "Participant";

  if (role && role !== actualRole) {
    throw new AppError(
      `This account is registered as '${actualRole}', not '${role}'. Please switch to the ${actualRole} login tab.`,
      403,
    );
  }

  // Lazy backfill for Participants created before the register fix.
  if (actualRole === "Participant") {
    const teamExists = await Team.exists({ _id: user._id });
    if (!teamExists) {
      await ensureParticipantTeam(user);
    }
  }

  const sessionId = crypto.randomUUID();
  const redisKey = `session:${sessionId}`;
  const sessionPayload = {
    user: {
      _id: user._id.toString(),
      email: user.email,
      role: actualRole,
      globalRole: actualRole,
      name: user.name,
    },
  };

  await redisClient.setEx(redisKey, SESSION_EXPIRY_SECONDS, JSON.stringify(sessionPayload));
  await redisClient.sAdd(`user_session:${user._id}`, sessionId);

  res.cookie("uid", sessionId, {
    httpOnly: true,
    signed: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRY_SECONDS * 1000,
  });

  return res.json({
    success: true,
    message: "Logged in",
    token: sessionId,
    sessionId,
    user: sessionPayload.user,
  });
};
// add to userController.js (or authController.js)

export const getCurrentUser = async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("name email role globalRole")
    .lean();
  if (!user) throw new AppError("User not found", 404);
  const rawRole = user.globalRole || user.role;
  const normalizedRole =
    rawRole === "Organizer" || rawRole === "Admin"
      ? "Organizer"
      : "Participant";
  return res
    .status(200)
    .json({ ...user, role: normalizedRole, globalRole: normalizedRole });
};

export const logout = async (req, res) => {
  let sessionId = req.signedCookies?.uid;
  if (!sessionId && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      sessionId = parts[1];
    }
  }
  if (sessionId) {
    await redisClient.del(`session:${sessionId}`);
  }
  res.clearCookie("uid");
  return res.status(200).json({ success: true, message: "Logged out" });
};
