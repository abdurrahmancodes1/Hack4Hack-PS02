import mongoose from "mongoose";
import { Worker } from "bullmq";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

import { getIoRedisConnection } from "../config/redis.js";
import { s3Client, getBucketName } from "../config/s3.js";
import { SUBMISSION_QUEUE_NAME } from "../queues/submissionQueue.js";
import SubmissionVersion from "../models/submissionVersionModel.js";
import Team from "../models/teamModel.js";
import FileAsset from "../models/fileAssetModel.js";
import { inspectArchiveStream } from "../services/archiveValidator.js";
import { checkSubmissionLinks } from "../services/linkChecker.js";
import { logAuditEvent } from "../services/auditService.js";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const readSmallStream = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

const loadContext = async (submissionVersionId) => {
  if (!mongoose.isValidObjectId(submissionVersionId)) return null;
  const version = await SubmissionVersion.findById(submissionVersionId);
  if (!version) return null;

  const [fileAsset, team] = await Promise.all([
    FileAsset.findById(version.fileAssetId),
    Team.findById(version.teamId),
  ]);
  if (!fileAsset || !team) return null;

  return { version, fileAsset, team };
};

const promoteIfValid = async ({ version, team }) => {
  if (version.isLate) {
    return;
  }
  // Compare-and-swap the active pointer. If another worker wins with a newer
  // version, reload and retry instead of letting an older result overwrite it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await Team.findById(team._id)
      .select("activeValidVersionId activeVersionNumber")
      .lean();
    if (!current) return;

    let activeVersionNumber = current.activeVersionNumber || 0;
    if (current.activeValidVersionId && activeVersionNumber === 0) {
      const active = await SubmissionVersion.findById(current.activeValidVersionId)
        .select("versionNumber")
        .lean();
      activeVersionNumber = active?.versionNumber || 0;
    }
    if (activeVersionNumber >= version.versionNumber) return;

    const result = await Team.updateOne(
      { _id: team._id, activeValidVersionId: current.activeValidVersionId ?? null },
      { $set: { activeValidVersionId: version._id, activeVersionNumber: version.versionNumber } },
    );
    if (result.modifiedCount === 1) return;
  }
  throw new Error(`Could not promote version ${version._id} after concurrent updates`);
};

const auditValidationResult = async ({ version, team, isValid, errors = [] }) =>
  logAuditEvent({
    actorId: version.submittedById,
    actorRole: "SystemWorker",
    action: isValid ? "SUBMISSION_VALIDATED" : "SUBMISSION_REJECTED",
    entityType: "SubmissionVersion",
    entityId: version._id,
    teamId: team._id,
    dedupeKey: `validation:${version._id}`,
    details: {
      versionNumber: version.versionNumber,
      isValid,
      errorsCount: errors.length,
      contentHashSha256: version.validationReport?.contentHashSha256 || null,
    },
  });

export const processValidationJob = async (job) => {
  const { submissionVersionId } = job.data;
  await job.updateProgress(10);
  // Add this right after `await job.updateProgress(10);`

  console.log(
    `[Validation Worker] job ${job.id} version ${submissionVersionId}`,
  );

  const ctx = await loadContext(submissionVersionId);
  if (!ctx) {
    console.warn(
      `[Validation Worker] context missing for ${submissionVersionId}`,
    );
    return { status: "VERSION_NOT_FOUND" };
  }

  const { version, fileAsset, team } = ctx;
  await job.updateProgress(30);
  const crashTestPauseMs = Number(process.env.CRASH_TEST_PAUSE_MS) || 0;
  if (crashTestPauseMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, crashTestPauseMs));
  }
  if (version.validationStatus === "VALID") {
    await promoteIfValid({ version, team });
    await FileAsset.updateOne(
      { _id: fileAsset._id, status: { $ne: "VALIDATED" } },
      { $set: { status: "VALIDATED", validatedAt: new Date() } },
    );
    await auditValidationResult({ version, team, isValid: true });
    return { status: "VALID", versionNumber: version.versionNumber };
  }
  if (version.validationStatus === "REJECTED") {
    await FileAsset.updateOne(
      { _id: fileAsset._id, status: { $ne: "REJECTED" } },
      { $set: { status: "REJECTED", validatedAt: new Date() } },
    );
    await auditValidationResult({ version, team, isValid: false, errors: version.validationReport?.validationErrors || [] });
    return { status: "REJECTED", versionNumber: version.versionNumber };
  }

  await SubmissionVersion.updateOne(
    { _id: version._id, validationStatus: { $in: ["PENDING", "VALIDATING"] } },
    { $set: { validationStatus: "VALIDATING" } },
  );

  const head = await s3Client.send(
    new HeadObjectCommand({ Bucket: getBucketName(), Key: fileAsset.s3Key }),
  );

  let archiveResult;

  if (!head.ContentLength || head.ContentLength > MAX_UPLOAD_BYTES || head.ContentLength !== fileAsset.declaredSizeBytes) {
    archiveResult = {
      valid: false,
      errors: [head.ContentLength !== fileAsset.declaredSizeBytes ? "Uploaded file size does not match the declared size" : "Uploaded file is empty or exceeds 100 MB"],
      fileCount: 0,
      uncompressedSizeBytes: 0,
      detectedMimeType: "unknown",
      contentHashSha256: null,
      preview: null,
    };
  } else {
    const headerResponse = await s3Client.send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: fileAsset.s3Key,
        Range: "bytes=0-4095",
      }),
    );
    const headerBuffer = await readSmallStream(headerResponse.Body);

    const fullResponse = await s3Client.send(
      new GetObjectCommand({ Bucket: getBucketName(), Key: fileAsset.s3Key }),
    );
    if (!fullResponse.Body) throw new Error("S3 returned empty body");

    archiveResult = await inspectArchiveStream(headerBuffer, fullResponse.Body);
  }

  let linkResults = [];
  try {
    linkResults = await checkSubmissionLinks({
      repoUrl: version.repoUrl,
      liveDemoUrl: version.liveDemoUrl,
    });
  } catch (e) {
    linkResults = [
      { url: version.liveDemoUrl, reachable: false, error: e.message },
    ];
  }

  const finalErrors = [...archiveResult.errors];
  for (const link of linkResults) {
    if (!link.reachable) {
      finalErrors.push(
        `Submitted URL '${link.url}' is unreachable (${link.error || "unknown"})`,
      );
    }
  }

  const isValid = archiveResult.valid && finalErrors.length === 0;

  await SubmissionVersion.updateOne(
    { _id: version._id },
    {
      $set: {
        validationStatus: isValid ? "VALID" : "REJECTED",
        validationReport: {
          archiveChecked: true,
          fileCount: archiveResult.fileCount,
          uncompressedSizeBytes: archiveResult.uncompressedSizeBytes,
          detectedMimeType: archiveResult.detectedMimeType,
          contentHashSha256: archiveResult.contentHashSha256,
          linksChecked: linkResults,
          validationErrors: finalErrors,
          validatedAt: new Date(),
        },
      },
    },
  );

  await FileAsset.updateOne(
    { _id: fileAsset._id },
    {
      $set: {
        status: isValid ? "VALIDATED" : "REJECTED",
        contentHashSha256: archiveResult.contentHashSha256 || undefined,
        detectedMimeType: archiveResult.detectedMimeType,
        preview: archiveResult.preview || undefined,
        validationErrors: finalErrors,
        validatedAt: new Date(),
      },
    },
  );

  if (isValid) {
    await promoteIfValid({ version, team });
  }

  await auditValidationResult({ version, team, isValid, errors: finalErrors });

  return {
    status: isValid ? "VALID" : "REJECTED",
    versionNumber: version.versionNumber,
    errors: finalErrors,
  };
};

export const startValidationWorker = () => {
  const connection = getIoRedisConnection();
  const concurrency = Number(process.env.VALIDATION_CONCURRENCY) || 5;

  const worker = new Worker(SUBMISSION_QUEUE_NAME, processValidationJob, {
    connection,
    concurrency,
    lockDuration: 300000, // Keep the 5 minute lock for 100MB files
    stalledInterval: 15000, // 🚨 Check for stalled jobs every 15 seconds (Default is 30s)
    maxStalledCount: 2, // 🚨 Retry a stalled job up to 2 times before failing
  });

  worker.on("completed", (job, result) =>
    console.log(`[Validation Worker] job ${job.id} done: ${result?.status}`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[Validation Worker] job ${job?.id} failed:`, err.message),
  );
  worker.on("error", (err) => {
    console.error(`[Validation Worker] Redis Error:`, err.message);
  });

  return worker;
};
