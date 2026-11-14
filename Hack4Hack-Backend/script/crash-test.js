import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDB } from "../config/mongoose.js";
import redisClient, { connectRedis } from "../config/redis.js";
import { getSubmissionQueue } from "../queues/submissionQueue.js";
import SubmissionVersion from "../models/submissionVersionModel.js";
import AuditLog from "../models/auditlogsModel.js";

const versionId = process.env.CRASH_TEST_VERSION_ID;
if (!versionId) throw new Error("Set CRASH_TEST_VERSION_ID to a real pending submission version");
if (process.env.RUN_VALIDATION_WORKER !== "false") {
  throw new Error("Stop the API worker first (RUN_VALIDATION_WORKER=false on the API process)");
}

await connectDB();
await connectRedis();
const queue = getSubmissionQueue();
const version = await SubmissionVersion.findById(versionId);
if (!version || !["PENDING", "VALIDATING"].includes(version.validationStatus)) {
  throw new Error("The selected version must be pending or validating");
}

const jobId = `crash-test-${versionId}`;
const oldJob = await queue.getJob(jobId);
if (oldJob) await oldJob.remove();
const job = await queue.add("validate-submission", { submissionVersionId: versionId }, { jobId, attempts: 3, removeOnComplete: false });

const workerPath = fileURLToPath(new URL("./validation-worker-entry.js", import.meta.url));
const startWorker = (pauseForCrashTest = false) => spawn(process.execPath, [workerPath], {
  stdio: "inherit",
  env: { ...process.env, CRASH_TEST_PAUSE_MS: pauseForCrashTest ? "15000" : "0" },
});
let child = startWorker(true);
const waitFor = async (check, timeoutMs) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

try {
  const started = await waitFor(async () => {
    const currentJob = await queue.getJob(jobId);
    return currentJob && (await currentJob.getState()) === "active" && currentJob.progress >= 30;
  }, 60_000);
  if (!started) throw new Error("Worker did not begin the job within 60 seconds");
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));

  child = startWorker(false);
  const completed = await waitFor(async () => (await job.getState()) === "completed", 10 * 60_000);
  if (!completed) throw new Error(`Job did not recover. Current state: ${await job.getState()}`);

  const finalVersion = await SubmissionVersion.findById(versionId).lean();
  if (!["VALID", "REJECTED"].includes(finalVersion?.validationStatus)) {
    throw new Error(`Unexpected final status: ${finalVersion?.validationStatus}`);
  }
  const auditCount = await AuditLog.countDocuments({ dedupeKey: `validation:${versionId}` });
  if (auditCount !== 1) throw new Error(`Expected one validation audit result, found ${auditCount}`);
  console.log(`PASS: worker crash recovered; version ${versionId} finished ${finalVersion.validationStatus} with one audit result.`);
} finally {
  child?.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await queue.close();
  if (redisClient.isOpen) await redisClient.quit();
  await mongoose.connection.close();
}
