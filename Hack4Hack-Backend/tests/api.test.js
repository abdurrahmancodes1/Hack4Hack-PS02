import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { connectDB } from "../config/mongoose.js";
import redisClient, { connectRedis } from "../config/redis.js";
import userRoutes from "../routes/userRoutes.js";
import teamRoutes from "../routes/teamRoutes.js";
import uploadRoutes from "../routes/uploadRoutes.js";
import submissionRoutes from "../routes/submissionRoutes.js";
import organizerRoutes from "../routes/organizerRoutes.js";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js";
import SubmissionVersion from "../models/submissionVersionModel.js";

process.env.MONGO_DB_NAME = `hack4hack_api_test_${process.pid}`;
process.env.SUBMISSION_DEADLINE_ISO = "2030-01-01T00:00:00.000Z";

const app = express();
app.use(cookieParser("api-tests"));
app.use(express.json());
app.use("/user", userRoutes);
app.use("/teams", teamRoutes);
app.use("/uploads", uploadRoutes);
app.use("/submissions", submissionRoutes);
app.use("/organizer", organizerRoutes);
app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));

const userId = new mongoose.Types.ObjectId();
const token = `api-test-${crypto.randomUUID()}`;
const limitedKeys = () => {
  const windowId = Math.floor(Math.floor(Date.now() / 1000) / 60);
  return [`rate:${userId}:${windowId}`, `rate:${userId}:${windowId - 1}`];
};

beforeAll(async () => {
  await connectDB();
  await Promise.all([User.init(), Team.init(), SubmissionVersion.init()]);
  await connectRedis();
  await User.create({
    _id: userId,
    name: "API Test Participant",
    email: `${token}@example.test`,
    globalRole: "Participant",
    role: "Participant",
  });
  await Team.create({ _id: userId, name: "API Test Team", createdBy: userId });
  await redisClient.setEx(`session:${token}`, 3600, JSON.stringify({
    user: { _id: userId.toString(), email: `${token}@example.test`, role: "Participant", globalRole: "Participant", name: "API Test Participant" },
  }));
});

beforeEach(async () => redisClient.del(limitedKeys()));

afterAll(async () => {
  await redisClient.del(`session:${token}`);
  await Team.deleteOne({ _id: userId });
  await User.deleteOne({ _id: userId });
  if (redisClient.isOpen) await redisClient.quit();
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe("HTTP API boundaries", () => {
  it("rejects unauthenticated submission status requests", async () => {
    expect((await request(app).get("/submissions/status")).status).toBe(401);
  });
  it("rejects unauthenticated version history requests", async () => {
    expect((await request(app).get("/submissions/versions")).status).toBe(401);
  });
  it("rejects unauthenticated submission writes", async () => {
    expect((await request(app).post("/submissions").send({})).status).toBe(401);
  });
  it("rejects unauthenticated organizer stats", async () => {
    expect((await request(app).get("/organizer/stats")).status).toBe(401);
  });
  it("rejects unauthenticated deadline changes", async () => {
    expect((await request(app).post("/organizer/hackathon").send({ deadlineAt: "2030-01-01" })).status).toBe(401);
  });
  it("denies participants access to organizer stats", async () => {
    expect((await request(app).get("/organizer/stats").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });
  it("denies participants access to deadline changes", async () => {
    expect((await request(app).post("/organizer/hackathon").set("Authorization", `Bearer ${token}`).send({ deadlineAt: "2030-01-01" })).status).toBe(403);
  });
  it("returns the authenticated participant's team", async () => {
    expect((await request(app).get("/teams/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);
  });
  it("returns an empty submission status for a new team", async () => {
    const response = await request(app).get("/submissions/status").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.hasSubmitted).toBe(false);
  });
  it("returns an empty version history for a new team", async () => {
    const response = await request(app).get("/submissions/versions").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
  });
  it("rejects an empty submission body", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({})).status).toBe(400);
  });
  it("rejects a missing submission title", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString() })).status).toBe(400);
  });
  it("rejects an overlong submission title", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString(), title: "x".repeat(201) })).status).toBe(400);
  });
  it("rejects non-HTTP repository protocols", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString(), title: "Valid title", repoUrl: "ftp://example.test/repo" })).status).toBe(400);
  });
  it("rejects malformed repository URLs", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString(), title: "Valid title", repoUrl: "not-a-url" })).status).toBe(400);
  });
  it("rejects descriptions over the supported limit", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString(), title: "Valid title", description: "x".repeat(2001) })).status).toBe(400);
  });
  it("requires an idempotency key for a valid write", async () => {
    expect((await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: userId.toString(), title: "Valid title" })).status).toBe(400);
  });
  it("rejects malformed file IDs before querying storage", async () => {
    const response = await request(app).post("/submissions").set("Authorization", `Bearer ${token}`).send({ fileId: "not-an-object-id", title: "Valid title", idempotencyKey: "test-18" });
    expect(response.status).toBe(400);
  });
  it("rejects upload initiation without required fields", async () => {
    expect((await request(app).post("/uploads/multipart/initiate").set("Authorization", `Bearer ${token}`).send({})).status).toBe(400);
  });
  it("rejects unsupported upload extensions", async () => {
    expect((await request(app).post("/uploads/multipart/initiate").set("Authorization", `Bearer ${token}`).send({ fileName: "project.tar.gz", fileSizeBytes: 2048, partCount: 1 })).status).toBe(400);
  });
  it("rejects uploads over 100 MB", async () => {
    expect((await request(app).post("/uploads/multipart/initiate").set("Authorization", `Bearer ${token}`).send({ fileName: "project.zip", fileSizeBytes: 104857601, partCount: 11 })).status).toBe(400);
  });
  it("rejects multipart counts outside supported bounds", async () => {
    expect((await request(app).post("/uploads/multipart/initiate").set("Authorization", `Bearer ${token}`).send({ fileName: "project.zip", fileSizeBytes: 2048, partCount: 21 })).status).toBe(400);
  });
  it("rejects malformed upload status IDs", async () => {
    expect((await request(app).get("/uploads/multipart/nope").set("Authorization", `Bearer ${token}`)).status).toBe(400);
  });
  it("rejects malformed part-signing IDs", async () => {
    expect((await request(app).post("/uploads/multipart/sign-part").set("Authorization", `Bearer ${token}`).send({ fileId: "nope", partNumber: 1 })).status).toBe(400);
  });
  it("rejects malformed completion IDs", async () => {
    expect((await request(app).post("/uploads/multipart/complete").set("Authorization", `Bearer ${token}`).send({ fileId: "nope", parts: [{ partNumber: 1, etag: "etag" }] })).status).toBe(400);
  });
  it("rejects malformed version IDs", async () => {
    expect((await request(app).get("/submissions/versions/nope").set("Authorization", `Bearer ${token}`)).status).toBe(400);
  });
});
