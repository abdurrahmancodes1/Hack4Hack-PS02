import Team from "../models/teamModel.js";
import mongoose from "mongoose";
import SubmissionVersion from "../models/submissionVersionModel.js";
import AuditLog from "../models/auditlogsModel.js";
import AppError from "../utils/AppError.js";
import { streamSubmissionsCsv } from "../services/csvExportService.js";
import { logAuditEvent } from "../services/auditService.js";
import { createGetSignedUrl } from "../config/s3.js";

import Hackathon from "../models/hackathonModel.js"; // Add to imports

export const setHackathonDeadline = async (req, res) => {
  const { name, deadlineAt, gracePeriodSeconds } = req.body;

  if (!deadlineAt || Number.isNaN(new Date(deadlineAt).getTime())) throw new AppError("A valid deadline is required", 400);
  if (new Date(deadlineAt).getTime() <= Date.now()) throw new AppError("The deadline must be in the future", 400);
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 100)) throw new AppError("Hackathon name must be 1 to 100 characters", 400);
  if (gracePeriodSeconds !== undefined && (!Number.isInteger(gracePeriodSeconds) || gracePeriodSeconds < 0 || gracePeriodSeconds > 1800)) throw new AppError("Grace period must be between 0 and 1800 seconds", 400);

  const existingHackathon = await Hackathon.findOne({ isActive: true }).lean();
  if (existingHackathon) {
    throw new AppError("The hackathon has already been started", 409);
  }

  // Create the new active hackathon
  const hackathon = await Hackathon.create({
    name: name || "Hack4Hack 2026",
    isActive: true,
    deadlineAt: new Date(deadlineAt),
    gracePeriodSeconds: gracePeriodSeconds ?? 300,
  });

  await logAuditEvent({
    actorId: req.user._id,
    actorRole: req.user.globalRole,
    action: "HACKATHON_DEADLINE_SET",
    entityType: "Hackathon",
    entityId: hackathon._id,
    details: { deadlineAt: hackathon.deadlineAt, gracePeriodSeconds: hackathon.gracePeriodSeconds },
    req,
  });

  return res.status(200).json({ success: true, hackathon });
};

export const getOrganizerStats = async (req, res) => {
  const [
    totalTeams,
    totalVersions,
    acceptedVersions,
    failedVersions,
    lateAttempts,
  ] = await Promise.all([
    Team.countDocuments({ submissionCount: { $gt: 0 } }),
    SubmissionVersion.countDocuments({}),
    Team.countDocuments({ submissionCount: { $gt: 0 }, activeValidVersionId: { $ne: null } }),
    SubmissionVersion.countDocuments({ validationStatus: "REJECTED" }),
    SubmissionVersion.countDocuments({ isLate: true }),
  ]);

  return res.status(200).json({
    success: true,
    stats: {
      totalSubmissions: totalTeams,
      totalVersions,
      acceptedSubmissions: acceptedVersions,
      failedChecks: failedVersions,
      lateAttempts,
    },
  });
};

export const listSubmissions = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = { submissionCount: { $gt: 0 } };
  if (req.query.search) {
    const safeSearch = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.name = { $regex: safeSearch, $options: "i" };
  }

  const [totalSubmissions, submissions] = await Promise.all([
    Team.countDocuments(filter),
    Team.find(filter)
      // ✅ FIX: Add the nested populate for fileAssetId
      .populate({
        path: "activeValidVersionId",
        select: "versionNumber validationStatus submittedAt",
        populate: {
          path: "fileAssetId",
          select: "preview", // Only fetch the preview to keep payload small
        },
      })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    pagination: {
      totalSubmissions,
      currentPage: page,
      totalPages: Math.ceil(totalSubmissions / limit),
      limit,
    },
    submissions,
  });
};

export const getSubmissionDetails = async (req, res) => {
  const { id } = req.params;

  // Inside organizerController.getSubmissionDetails
  const team = await Team.findById(id)
    .populate({
      path: "activeValidVersionId",
      populate: { path: "fileAssetId" }, // This must be here!
    })
    .lean();
  if (!team) throw new AppError("Submission not found", 404);

  const [versions, auditLogs] = await Promise.all([
    SubmissionVersion.find({ teamId: team._id })
      .sort({ versionNumber: -1 })
      .populate("submittedById", "name email")
      .populate("fileAssetId")
      .lean(),
    AuditLog.find({ teamId: team._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .populate("actorId", "name email")
      .lean(),
  ]);

  return res
    .status(200)
    .json({ success: true, submission: team, versions, auditLogs });
};

export const getAuditLogs = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.teamId) {
    if (!mongoose.isValidObjectId(req.query.teamId)) throw new AppError("Invalid team ID", 400);
    filter.teamId = req.query.teamId;
  }
  if (req.query.action) filter.action = req.query.action;
  if (req.query.entityType) filter.entityType = req.query.entityType;

  const [totalLogs, logs] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actorId", "name email")
      .populate("teamId", "name")
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    pagination: {
      totalLogs,
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
      limit,
    },
    logs,
  });
};

export const exportSubmissionsCsv = async (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `hack4hack_submissions_${timestamp}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

  await logAuditEvent({
    actorId: req.user._id,
    actorRole: req.user.globalRole,
    action: "ORGANIZER_EXPORT_CSV",
    entityType: "Team",
    entityId: req.user._id,
    details: { exportTime: new Date().toISOString() },
    req,
  });

  return streamSubmissionsCsv(res);
};

export const disqualifyTeam = async (req, res) => {
  const { teamId } = req.params;
  const { reason } = req.body || {};
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) throw new AppError("Reason must be a string under 500 characters", 400);

  const team = await Team.findById(teamId);
  if (!team) {
    throw new AppError("Team not found", 404);
  }

  team.isDisqualified = true;
  await team.save();

  await logAuditEvent({
    actorId: req.user._id,
    actorRole: req.user.globalRole,
    action: "TEAM_DISQUALIFIED",
    entityType: "Team",
    entityId: team._id,
    teamId: team._id,
    details: { reason: reason || "Disqualified by organizer decision" },
    req,
  });

  return res.status(200).json({
    success: true,
    message: `Team '${team.name}' has been disqualified`,
    teamId: team._id,
  });
};

export const getSubmissionDownloadUrl = async (req, res) => {
  const { id } = req.params;
  const versionNumber = req.query.version;
  if (versionNumber !== undefined && (!/^\d+$/.test(String(versionNumber)) || Number(versionNumber) < 1)) {
    throw new AppError("Version must be a positive integer", 400);
  }

  const team = await Team.findById(id).lean();
  if (!team) {
    throw new AppError("Submission not found", 404);
  }

  let version;
  if (versionNumber) {
    version = await SubmissionVersion.findOne({
      teamId: team._id,
      versionNumber: Number(versionNumber),
    })
      .populate("fileAssetId")
      .lean();
  } else if (team.activeValidVersionId) {
    version = await SubmissionVersion.findById(team.activeValidVersionId)
      .populate("fileAssetId")
      .lean();
  } else {
    version = await SubmissionVersion.findOne({ teamId: team._id })
      .sort({ versionNumber: -1 })
      .populate("fileAssetId")
      .lean();
  }

  if (!version || !version.fileAssetId?.s3Key) {
    throw new AppError(
      "No file asset associated with this submission version",
      404,
    );
  }

  const s3Key = version.fileAssetId.s3Key;
  const originalFileName =
    version.fileAssetId.originalFileName ||
    `${team.name}-v${version.versionNumber}.zip`;

  const downloadUrl = await createGetSignedUrl({
    key: s3Key,
    download: true,
    filename: originalFileName,
    expiresIn: 3600,
  });

  return res.status(200).json({
    success: true,
    downloadUrl,
    filename: originalFileName,
    expiresInSeconds: 3600,
    isActiveVersion: !!team.activeValidVersionId,
    validationStatus: version.validationStatus || "PENDING",
    contentHashSha256: version.fileAssetId.contentHashSha256 || null,
  });
};
