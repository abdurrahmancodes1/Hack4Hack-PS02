import mongoose from "mongoose";
import path from "node:path";

import FileAsset from "../models/fileAssetModel.js";
import AppError from "../utils/AppError.js";
import {
  initiateUploadSchema,
  signPartSchema,
  completeUploadSchema,
} from "../validators/uploadSchema.js";
import {
  generateSubmissionS3Key,
  startMultipartSession,
  generateAllPartSignedUrls,
  generateSinglePartSignedUrl,
  verifyAndCompleteMultipartSession,
  cancelMultipartSession,
} from "../services/s3Service.js";
import { logAuditEvent } from "../services/auditService.js";
import { getDeadlineConfig } from "../middlewares/deadlineMiddleware.js";
import { listMultipartParts, getS3FileMetaData } from "../config/s3.js";

const UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;
const SIGNED_URL_EXPIRY_SECONDS = 900;

const getValidationMessage = (e) =>
  e.issues?.[0]?.message || e.errors?.[0]?.message || "Invalid input";
const getUploadHardCutoff = (asset) => asset.hardCutoffAtInitiate?.getTime() ??
  asset.deadlineAtInitiate.getTime() + (asset.gracePeriodMsAtInitiate ?? 300000);

const validateParts = (parts, totalParts) => {
  if (!Array.isArray(parts) || parts.length !== totalParts) {
    throw new AppError("Invalid uploaded parts count", 400);
  }
  const seen = new Set();
  for (const p of parts) {
    if (
      !Number.isInteger(p.partNumber) ||
      p.partNumber < 1 ||
      p.partNumber > totalParts ||
      typeof p.etag !== "string" ||
      !p.etag.trim() ||
      seen.has(p.partNumber)
    ) {
      throw new AppError("Invalid or duplicate uploaded part", 400);
    }
    seen.add(p.partNumber);
  }
};

const findOwnedAsset = async (assetId, userId) => {
  if (!mongoose.isValidObjectId(assetId)) {
    throw new AppError("Invalid file ID", 400);
  }
  const asset = await FileAsset.findOne({ _id: assetId, uploadedBy: userId });
  if (!asset) throw new AppError("File not found", 404);
  return asset;
};

export const initiateUpload = async (req, res) => {
  const parsed = initiateUploadSchema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError(getValidationMessage(parsed.error), 400);

  const { fileName, contentType, fileSizeBytes, partCount } = parsed.data;
  const userId = req.user._id;

  const { deadlineTime, gracePeriodMs } = await getDeadlineConfig();
  const deadline = new Date(deadlineTime);
  const now = Date.now();

  if (now > deadline.getTime()) {
    throw new AppError("New uploads must start before the submission deadline", 403);
  }

  const fileId = new mongoose.Types.ObjectId();
  const extension = path.extname(fileName).toLowerCase() || ".zip";
  const s3Key = generateSubmissionS3Key({
    teamId: userId.toString(),
    sessionId: fileId.toString(),
    extension,
  });
  const expiresAt = new Date(now + UPLOAD_EXPIRY_MS);

  const { uploadId } = await startMultipartSession({ s3Key, contentType });

  let asset;
  try {
    asset = await FileAsset.create({
      _id: fileId,
      uploadedBy: userId,
      originalFileName: fileName,
      contentType,
      declaredSizeBytes: fileSizeBytes,
      totalParts: partCount,
      s3Bucket:
        process.env.AWS_BUCKET ||
        process.env.AWS_BUCKET_NAME ||
        process.env.BUCKET_NAME ||
        "hack4hack-submissions",
      s3Key,
      s3UploadId: uploadId,
      status: "UPLOADING",
      initiatedAt: new Date(now),
      deadlineAtInitiate: deadline,
      gracePeriodMsAtInitiate: gracePeriodMs,
      hardCutoffAtInitiate: new Date(deadlineTime + gracePeriodMs),
      expiresAt,
    });
  } catch (err) {
    try {
      await cancelMultipartSession({ key: s3Key, uploadId });
    } catch (e) {
      console.error(e);
    }
    throw err;
  }

  try {
    const parts = await generateAllPartSignedUrls({
      key: s3Key,
      uploadId,
      totalParts: partCount,
      expiresIn: SIGNED_URL_EXPIRY_SECONDS,
    });

    await logAuditEvent({
      actorId: userId,
      actorRole: req.user.globalRole,
      action: "UPLOAD_INITIATED",
      entityType: "FileAsset",
      entityId: asset._id,
      details: { fileName, fileSizeBytes, totalParts: partCount },
      req,
    });

    return res.status(201).json({
      success: true,
      fileId: asset._id,
      totalParts: partCount,
      expiresAt,
      parts,
    });
  } catch (err) {
    await FileAsset.updateOne(
      { _id: asset._id, status: "UPLOADING" },
      { $set: { status: "ABORTED" } },
    );
    try {
      await cancelMultipartSession({ key: s3Key, uploadId });
    } catch (e) {
      console.error(e);
    }
    throw err;
  }
};

export const signPart = async (req, res) => {
  const parsed = signPartSchema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError(getValidationMessage(parsed.error), 400);

  const { fileId, partNumber } = parsed.data;
  const asset = await findOwnedAsset(fileId, req.user._id);

  if (Date.now() > getUploadHardCutoff(asset)) {
    throw new AppError("Upload grace period has expired", 403);
  }

  if (asset.status !== "UPLOADING") {
    throw new AppError(`Cannot sign part when file is ${asset.status}`, 409);
  }
  if (!asset.expiresAt || asset.expiresAt.getTime() <= Date.now()) {
    await FileAsset.updateOne(
      { _id: asset._id, status: "UPLOADING" },
      { $set: { status: "EXPIRED" } },
    );
    throw new AppError("Upload has expired", 410);
  }
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > asset.totalParts
  ) {
    throw new AppError("Invalid part number", 400);
  }

  const presignedUrl = await generateSinglePartSignedUrl({
    key: asset.s3Key,
    uploadId: asset.s3UploadId,
    partNumber,
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  });

  return res
    .status(200)
    .json({ success: true, fileId: asset._id, partNumber, presignedUrl });
};

export const completeUpload = async (req, res) => {
  const parsed = completeUploadSchema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError(getValidationMessage(parsed.error), 400);

  const { fileId, parts } = parsed.data;
  const userId = req.user._id;

  const asset = await findOwnedAsset(fileId, userId);

  if (["COMPLETED", "VALIDATED", "REJECTED"].includes(asset.status)) {
    return res.status(200).json({
      success: true,
      message: "File upload already completed",
      fileId: asset._id,
      status: asset.status,
    });
  }
  if (asset.status !== "UPLOADING") {
    throw new AppError(
      `Cannot complete upload when file is ${asset.status}`,
      409,
    );
  }
  if (!asset.expiresAt || asset.expiresAt.getTime() <= Date.now()) {
    await FileAsset.updateOne(
      { _id: asset._id, status: "UPLOADING" },
      { $set: { status: "EXPIRED" } },
    );
    throw new AppError("Upload has expired", 410);
  }

  const now = Date.now();
  const deadline = asset.deadlineAtInitiate.getTime();
  const hardCutoff = getUploadHardCutoff(asset);
  const initiatedBeforeCutoff = asset.initiatedAt.getTime() <= deadline;

  if (now > hardCutoff) {
    await FileAsset.updateOne(
      { _id: asset._id, status: "UPLOADING" },
      { $set: { status: "EXPIRED" } },
    );
    try {
      await cancelMultipartSession({
        key: asset.s3Key,
        uploadId: asset.s3UploadId,
      });
    } catch (e) {
      console.error(e);
    }
    throw new AppError("Submission deadline has expired", 403);
  }
  if (!initiatedBeforeCutoff) {
    await FileAsset.updateOne(
      { _id: asset._id, status: "UPLOADING" },
      { $set: { status: "EXPIRED" } },
    );
    throw new AppError("Upload started after the deadline", 403);
  }

  validateParts(parts, asset.totalParts);

  const claimed = await FileAsset.findOneAndUpdate(
    {
      _id: asset._id,
      uploadedBy: userId,
      status: "UPLOADING",
      expiresAt: { $gt: new Date() },
    },
    { $set: { status: "COMPLETING" } },
    { new: true },
  );
  if (!claimed) {
    throw new AppError(
      "Upload is already being completed or is no longer active",
      409,
    );
  }

  let s3Result;
  try {
    s3Result = await verifyAndCompleteMultipartSession({
      key: claimed.s3Key,
      uploadId: claimed.s3UploadId,
      clientParts: parts,
    });
  } catch (error) {
    await FileAsset.updateOne(
      { _id: claimed._id, status: "COMPLETING" },
      { $set: { status: "UPLOADING" } },
    );
    throw error;
  }

  const completed = await FileAsset.findOneAndUpdate(
    { _id: claimed._id, uploadedBy: userId, status: "COMPLETING" },
    {
      $set: {
        status: "COMPLETED",
        completedAt: new Date(),
        fileSizeBytes: s3Result.contentLengthBytes ?? claimed.declaredSizeBytes,
        s3ETag: s3Result.etag,
      },
    },
    { new: true },
  );
  if (!completed) {
    throw new AppError(
      "Upload completed on storage but state could not be updated",
      500,
    );
  }

  await logAuditEvent({
    actorId: userId,
    actorRole: req.user.globalRole,
    action: "UPLOAD_COMPLETED",
    entityType: "FileAsset",
    entityId: completed._id,
    details: { fileSizeBytes: completed.fileSizeBytes },
    req,
  });

  return res.status(200).json({
    success: true,
    message: "Upload completed; you can now submit",
    fileId: completed._id,
    status: "COMPLETED",
  });
};

export const abortUpload = async (req, res) => {
  const { fileId } = req.body;
  if (!mongoose.isValidObjectId(fileId)) {
    throw new AppError("Valid fileId is required", 400);
  }

  const asset = await FileAsset.findOneAndUpdate(
    { _id: fileId, uploadedBy: req.user._id, status: "UPLOADING" },
    { $set: { status: "ABORTED" } },
    { new: true },
  );
  if (!asset) {
    const existing = await findOwnedAsset(fileId, req.user._id);
    throw new AppError(`Cannot abort file in ${existing.status} state`, 409);
  }

  await cancelMultipartSession({
    key: asset.s3Key,
    uploadId: asset.s3UploadId,
  });

  await logAuditEvent({
    actorId: req.user._id,
    actorRole: req.user.globalRole,
    action: "UPLOAD_ABORTED",
    entityType: "FileAsset",
    entityId: asset._id,
    details: {},
    req,
  });

  return res.status(200).json({ success: true, message: "Upload aborted" });
};

export const getUploadStatus = async (req, res) => {
  let asset = await findOwnedAsset(req.params.fileId, req.user._id);
  if (asset.status === "COMPLETING") {
    try {
      const metadata = await getS3FileMetaData(asset.s3Key);
      asset = await FileAsset.findOneAndUpdate(
        { _id: asset._id, status: "COMPLETING" },
        { $set: { status: "COMPLETED", completedAt: new Date(), fileSizeBytes: metadata.ContentLength, s3ETag: metadata.ETag } },
        { new: true },
      );
      if (!asset) asset = await findOwnedAsset(req.params.fileId, req.user._id);
    } catch {
      return res.status(200).json({ success: true, status: "COMPLETING", uploadedParts: [] });
    }
  }
  if (asset.status === "UPLOADING" && (asset.expiresAt.getTime() <= Date.now() || Date.now() > getUploadHardCutoff(asset))) {
    await FileAsset.updateOne({ _id: asset._id, status: "UPLOADING" }, { $set: { status: "EXPIRED" } });
    await cancelMultipartSession({ key: asset.s3Key, uploadId: asset.s3UploadId });
    return res.status(200).json({ success: true, status: "EXPIRED", uploadedParts: [] });
  }
  if (asset.status !== "UPLOADING") {
    return res.status(200).json({ success: true, status: asset.status, uploadedParts: [] });
  }
  const result = await listMultipartParts({ key: asset.s3Key, uploadId: asset.s3UploadId });
  return res.status(200).json({
    success: true,
    status: asset.status,
    totalParts: asset.totalParts,
    uploadedParts: (result.Parts || []).map(({ PartNumber, ETag }) => ({
      partNumber: PartNumber,
      etag: ETag,
    })),
  });
};
