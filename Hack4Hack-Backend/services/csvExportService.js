import { format } from "fast-csv";
import Team from "../models/teamModel.js"; // ✅ Import Team, not Submission

export const streamSubmissionsCsv = (res, filter = { submissionCount: { $gt: 0 } }) => {
  const csvStream = format({
    headers: [
      "Team ID",
      "Team Name",
      "Project Title",
      "Repository URL",
      "Live Demo URL",
      "Active Version Number",
      "Validation Status",
      "Submitted At",
      "Is Late",
      "Is Disqualified",
    ],
  });

  // Pipe the CSV stream directly to the Express response
  csvStream.pipe(res);

  // ✅ Use Team cursor, and populate the version
  const cursor = Team.find(filter)
    .populate(
      "activeValidVersionId",
      "versionNumber validationStatus submittedAt isLate",
    )
    .lean()
    .cursor();

  cursor.on("data", (team) => {
    const activeVersion = team.activeValidVersionId || {};

    csvStream.write({
      "Team ID": team._id ? team._id.toString() : "N/A",
      "Team Name": team.name || "N/A",
      "Project Title": team.title || "Untitled",
      "Repository URL": team.repoUrl || "",
      "Live Demo URL": team.liveDemoUrl || "",
      "Active Version Number": activeVersion.versionNumber ?? "None",
      "Validation Status": activeVersion.validationStatus || "NO_VALID_VERSION",
      "Submitted At": activeVersion.submittedAt
        ? new Date(activeVersion.submittedAt).toISOString()
        : "N/A",
      "Is Late": activeVersion.isLate ? "YES" : "NO",
      "Is Disqualified": team.isDisqualified ? "YES" : "NO",
    });
  });

  cursor.on("end", () => {
    csvStream.end();
  });

  cursor.on("error", (err) => {
    console.error("Cursor error streaming CSV:", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ success: false, error: "Failed to generate CSV export" });
    } else {
      csvStream.end();
    }
  });

  return csvStream;
};
