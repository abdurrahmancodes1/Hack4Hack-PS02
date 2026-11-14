import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import userRoutes from "./routes/userRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import submissionRoutes from "./routes/submissionRoutes.js";
import organizerRoutes from "./routes/organizerRoutes.js";
import { getDeadlineConfig } from "./middlewares/deadlineMiddleware.js";
import Hackathon from "./models/hackathonModel.js";
import { connectDB } from "./config/mongoose.js";
import redisClient, { connectRedis } from "./config/redis.js";
import { startValidationWorker } from "./workers/validationWorker.js";
import SubmissionVersion from "./models/submissionVersionModel.js";
import { ensureValidationQueued } from "./controllers/submissionController.js";
import FileAsset from "./models/fileAssetModel.js";
import { getS3FileMetaData } from "./config/s3.js";
import Team from "./models/teamModel.js";
import AuditLog from "./models/auditlogsModel.js";

if (process.env.NODE_ENV === "production" && !process.env.COOKIE_SIGNER) {
  throw new Error("COOKIE_SIGNER must be set in production");
}

// Initialize external connections
await connectDB();
await Promise.all([Team.init(), SubmissionVersion.init(), AuditLog.init()]);
await connectRedis();

const app = express();
app.set("trust proxy", 1);

app.use(
  cookieParser(process.env.COOKIE_SIGNER || "local-development-cookie-signer"),
);
app.use(express.json({ limit: "5mb" }));

const allowedOrigins = [
  process.env.CLIENT_URL_1,
  process.env.CLIENT_URL_2,
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
const STALE_MS = 2 * 60 * 1000; // 2 minutes

export const sweepStuckUploads = async () => {
  const cutoff = new Date(Date.now() - STALE_MS);
  const stuckUploads = await FileAsset.find({
    status: "COMPLETING",
    updatedAt: { $lt: cutoff },
  }).select("_id s3Key");
  for (const asset of stuckUploads) {
    try {
      const metadata = await getS3FileMetaData(asset.s3Key);
      await FileAsset.updateOne(
        { _id: asset._id, status: "COMPLETING" },
        {
          $set: {
            status: "COMPLETED",
            completedAt: new Date(),
            fileSizeBytes: metadata.ContentLength,
            s3ETag: metadata.ETag,
          },
        },
      );
    } catch {
      await FileAsset.updateOne(
        { _id: asset._id, status: "COMPLETING" },
        { $set: { status: "UPLOADING" } },
      );
    }
  }
  const stuck = await SubmissionVersion.find({
    validationStatus: { $in: ["PENDING", "VALIDATING"] },
    updatedAt: { $lt: cutoff },
  }).select("_id updatedAt validationStatus");

  for (const version of stuck) {
    try {
      await ensureValidationQueued(version._id);
      console.log(`[Recovery] Ensured validation job for ${version._id}`);
    } catch (e) {
      console.error(`[Recovery] Failed for ${version._id}`, e);
    }
  }
  return stuck.length + stuckUploads.length;
};
const recoveryTimer = setInterval(
  () => sweepStuckUploads().catch(console.error),
  60_000,
);
recoveryTimer.unref();

// Health check endpoint for load balancers and container orchestrators
app.get("/health", async (req, res) => {
  const mongoStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const redisStatus = redisClient.isOpen ? "connected" : "disconnected";

  const isHealthy = mongoStatus === "connected" && redisStatus === "connected";

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "degraded",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  });
});

app.get(["/hackathon", "/api/v1/hackathon"], async (req, res) => {
  const { deadlineTime, gracePeriodMs, hardCutoffTime } =
    await getDeadlineConfig();
  let title = "Hack4Hack 2026";
  if (mongoose.connection.readyState === 1) {
    try {
      const active = await Hackathon.findOne({ isActive: true }).lean();
      if (active) title = active.title || active.name || title;
    } catch {
      // ignore
    }
  }
  res.json({
    success: true,
    title,
    deadlineAt: new Date(deadlineTime).toISOString(),
    gracePeriodSeconds: Math.floor(gracePeriodMs / 1000),
    hardCutoffAt: new Date(hardCutoffTime).toISOString(),
    serverTime: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({
    name: "Hack4Hack 2026 Submission Backend",
    version: "1.0.0",
    status: "active",
  });
});

// User & Auth Routes
app.use("/user", userRoutes);
app.use("/api/v1/auth", userRoutes);

// Team Routes
app.use("/teams", teamRoutes);
app.use("/api/v1/teams", teamRoutes);

// Upload Routes (Direct-to-S3 Multipart Uploads)
app.use("/uploads", uploadRoutes);
app.use("/api/v1/uploads", uploadRoutes);

// Submission & Versioning Routes
app.use("/submissions", submissionRoutes);
app.use("/api/v1/submissions", submissionRoutes);

// Organizer Dashboard & Management Routes
app.use("/organizer", organizerRoutes);
app.use("/api/v1/organizer", organizerRoutes);

// Admin Routes (Legacy User Administration)

// Centralized error handling
app.use((err, req, res, next) => {
  const statusCode =
    err.statusCode || (err.name === "ValidationError" ? 400 : 500);

  if (statusCode === 500) {
    console.error("Unhandled Server Error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500 && process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message,
  });
});

const PORT = Number(process.env.PORT) || 4000;
let validationWorker;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (process.env.RUN_VALIDATION_WORKER !== "false") {
    validationWorker = startValidationWorker();
    console.log("Validation worker started.");
  }
});
// Graceful shutdown handling
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);
  clearInterval(recoveryTimer);
  await validationWorker?.close();
  server.close(async () => {
    try {
      await mongoose.connection.close();
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
      console.log(
        "Database and Redis connections closed. Process terminating.",
      );
      process.exit(0);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export default app;
