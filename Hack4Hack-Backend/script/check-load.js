import "dotenv/config";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { connectDB } from "../config/mongoose.js";
import SubmissionVersion from "../models/submissionVersionModel.js";

const fixturePath = fileURLToPath(new URL("./load-fixtures.json", import.meta.url));
const { fixtures } = JSON.parse(await readFile(fixturePath, "utf8"));
await connectDB();
try {
  const teamIds = fixtures.map(({ teamId }) => new mongoose.Types.ObjectId(teamId));
  const rows = await SubmissionVersion.aggregate([
    { $match: { teamId: { $in: teamIds } } },
    { $group: { _id: "$teamId", count: { $sum: 1 } } },
  ]);
  const submitted = new Map(rows.map(({ _id, count }) => [_id.toString(), count]));
  const missing = fixtures.filter(({ teamId }) => !submitted.has(teamId));
  const duplicates = fixtures.filter(({ teamId }) => (submitted.get(teamId) || 0) !== 1);
  if (missing.length || duplicates.length) {
    throw new Error(`Reconciliation failed: ${missing.length} missing teams, ${duplicates.length} teams without exactly one version`);
  }
  console.log(`PASS: all ${fixtures.length} seeded teams have exactly one stored submission version.`);
} finally {
  await mongoose.connection.close();
}
