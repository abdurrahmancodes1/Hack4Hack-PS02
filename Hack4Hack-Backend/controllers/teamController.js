import Team from "../models/teamModel.js";
import User from "../models/userModel.js";
import SubmissionVersion from "../models/submissionVersionModel.js";
import AppError from "../utils/AppError.js";

export const getMyTeam = async (req, res) => {
  const team = req.team;
  if (!team) throw new AppError("No team associated with your account", 404);

  const user = await User.findById(team._id).select("name email").lean();
  const latestVersion = await SubmissionVersion.findOne({ teamId: team._id })
    .sort({ versionNumber: -1 })
    .populate(
      "fileAssetId",
      "originalFileName fileSizeBytes status contentHashSha256",
    )
    .lean();

  return res.status(200).json({
    success: true,
    team: {
      id: team._id,
      name: team.name,
      isDisqualified: team.isDisqualified,
      currentVersionNumber: team.latestVersionNumber || 0,
      title: team.title || null,
      repoUrl: team.repoUrl || null,
      liveDemoUrl: team.liveDemoUrl || null,
      createdAt: team.createdAt,
    },
    members: user
      ? [
          {
            userId: user._id,
            name: user.name,
            email: user.email,
            role: "owner",
          },
        ]
      : [],
    submission: latestVersion
      ? {
          activeVersion: team.activeValidVersionId || null,
          latestVersionNumber: latestVersion.versionNumber,
          submissionCount: team.submissionCount || 0,
          latestVersion,
        }
      : null,
  });
};
