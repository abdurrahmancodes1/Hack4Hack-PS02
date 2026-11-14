import Team from "../models/teamModel.js";
import mongoose from "mongoose";
import SubmissionVersion from "../models/submissionVersionModel.js";
import FileAsset from "../models/fileAssetModel.js";
import AppError from "../utils/AppError.js";
import { createSubmissionSchema } from "../validators/submissionSchema.js";
import { getSubmissionQueue } from "../queues/submissionQueue.js";
import { logAuditEvent } from "../services/auditService.js";

export const createSubmission = async (req, res) => {
  const { success, data, error } = createSubmissionSchema.safeParse(req.body);
  if (!success) {
    const msg =
      error.issues?.[0]?.message ||
      error.errors?.[0]?.message ||
      "Invalid input";
    throw new AppError(msg, 400);
  }

  const teamId = req.team._id;
  const userId = req.user._id;
  const idempotencyKey =
    req.headers["idempotency-key"] ||
    req.headers["x-idempotency-key"] ||
    req.body.idempotencyKey;

  if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.length > 200) {
    throw new AppError("A valid Idempotency-Key is required", 400);
  }
  if (!mongoose.isValidObjectId(data.fileId)) throw new AppError("Invalid file ID", 400);

  if (idempotencyKey) {
    const existing = await SubmissionVersion.findOne({
      teamId,
      idempotencyKey,
    }).lean();
    if (existing) {
      await ensureValidationQueued(existing._id);
      return res.status(200).json({
        success: true,
        message: "Submission version already exists (idempotent replay)",
        versionNumber: existing.versionNumber,
        validationStatus: existing.validationStatus,
        submittedAt: existing.submittedAt,
        isLate: existing.isLate,
      });
    }
  }

  const fileAsset = await FileAsset.findOne({
    _id: data.fileId,
    uploadedBy: userId,
    status: "COMPLETED",
  });
  if (!fileAsset) {
    throw new AppError(
      "File not found, not owned by you, or not yet fully uploaded",
      404,
    );
  }
  const submittedAt = new Date();
  const hardCutoff = fileAsset.hardCutoffAtInitiate?.getTime() ??
    fileAsset.deadlineAtInitiate.getTime() + (fileAsset.gracePeriodMsAtInitiate ?? 300000);
  if (fileAsset.initiatedAt.getTime() > fileAsset.deadlineAtInitiate.getTime() || submittedAt.getTime() > hardCutoff) {
    throw new AppError("Only uploads started before the deadline can be submitted during the grace period", 403);
  }

  const team = await Team.findOneAndUpdate(
    { _id: teamId },
    {
      $set: {
        title: data.title,
        description: data.description || "",
        repoUrl: data.repoUrl || "",
        liveDemoUrl: data.liveDemoUrl || "",
      },
      $inc: { latestVersionNumber: 1, submissionCount: 1 },
    },
    { new: true },
  );
  if (!team) throw new AppError("Team not found", 404);

  const versionNumber = team.latestVersionNumber;

  // ✅ FIX: Link file to team BEFORE creating the version
  await FileAsset.updateOne({ _id: fileAsset._id }, { $set: { teamId } });

  let submissionVersion;
  try {
    submissionVersion = await SubmissionVersion.create({
      teamId,
      fileAssetId: fileAsset._id,
      versionNumber,
      submittedById: userId,
      title: data.title,
      description: data.description || "",
      repoUrl: data.repoUrl || "",
      liveDemoUrl: data.liveDemoUrl || "",
      idempotencyKey,
      submittedAt,
      isLate: submittedAt.getTime() > fileAsset.deadlineAtInitiate.getTime(),
      validationStatus: "PENDING",
    });
  } catch (error) {
    await Team.updateOne({ _id: teamId, submissionCount: { $gt: 0 } }, { $inc: { submissionCount: -1 } });
    if (error.code === 11000) {
      const duplicate = await SubmissionVersion.findOne({ teamId, idempotencyKey }).lean();
      if (duplicate) {
        await ensureValidationQueued(duplicate._id);
        return res.status(200).json({ success: true, message: "Submission version already exists (idempotent replay)", versionNumber: duplicate.versionNumber, validationStatus: duplicate.validationStatus, submittedAt: duplicate.submittedAt, isLate: duplicate.isLate });
      }
    }
    throw error;
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: req.user.globalRole,
    action: "SUBMISSION_VERSION_CREATED",
    entityType: "SubmissionVersion",
    entityId: submissionVersion._id,
    teamId,
    details: {
      versionNumber,
      isLate: submissionVersion.isLate,
      fileAssetId: fileAsset._id,
    },
    req,
  });

  await ensureValidationQueued(submissionVersion._id);

  return res.status(201).json({
    success: true,
    message: "Submission version created and queued for background validation",
    versionNumber,
    validationStatus: submissionVersion.validationStatus,
    submittedAt: submissionVersion.submittedAt,
    isLate: submissionVersion.isLate,
    activeValidVersionId: team.activeValidVersionId || null,
  });
};

export const ensureValidationQueued = async (versionId) => {
  const queue = getSubmissionQueue();
  const jobId = versionId.toString();
  const existing = await queue.getJob(jobId);
  if (existing) {
    if (await existing.getState() === "failed") await existing.retry();
    return existing;
  }
  return queue.add("validate-submission", { submissionVersionId: jobId }, { jobId });
};

export const getSubmissionStatus = async (req, res) => {
  const teamId = req.team._id;

  const team = await Team.findById(teamId)
    .populate({
      path: "activeValidVersionId",
      populate: {
        path: "fileAssetId",
        select: "originalFileName s3Key contentHashSha256 status preview",
      },
    })
    .lean();
  if (!team) throw new AppError("Team not found", 404);

  const latestVersion = await SubmissionVersion.findOne({ teamId })
    .sort({ versionNumber: -1 })
    .populate({
      path: "fileAssetId",
      select:
        "originalFileName status preview validationErrors contentHashSha256 fileSizeBytes",
    })
    .lean();

  return res.status(200).json({
    success: true,
    hasSubmitted: !!latestVersion,
    title: team.title || null,
    repoUrl: team.repoUrl || null,
    liveDemoUrl: team.liveDemoUrl || null,
    activeVersion: team.activeValidVersionId || null,
    latestVersion: latestVersion || null,
  });
};

export const getSubmissionVersions = async (req, res) => {
  const versions = await SubmissionVersion.find({ teamId: req.team._id })
    .sort({ versionNumber: -1 })
    .populate("submittedById", "name email")
    .populate(
      "fileAssetId",
      "originalFileName fileSizeBytes status contentHashSha256",
    )
    .lean();
  return res
    .status(200)
    .json({ success: true, count: versions.length, versions });
};

export const getSubmissionVersionById = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.versionId)) throw new AppError("Invalid version ID", 400);
  const version = await SubmissionVersion.findOne({
    _id: req.params.versionId,
    teamId: req.team._id,
  })
    .populate("submittedById", "name email")
    .populate("fileAssetId")
    .lean();

  if (!version) throw new AppError("Submission version not found", 404);
  return res.status(200).json({ success: true, version });
};
