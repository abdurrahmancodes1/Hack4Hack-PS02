import "dotenv/config";
import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import mongoose from "mongoose";
import { connectDB } from "../config/mongoose.js";
import { getDeadlineConfig } from "../middlewares/deadlineMiddleware.js";
import redisClient, { connectRedis } from "../config/redis.js";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js";

const count = Number(process.env.LOAD_TEST_TEAMS || 2000);
if (!Number.isInteger(count) || count < 1 || count > 2000) throw new Error("LOAD_TEST_TEAMS must be from 1 to 2000");
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + crypto.randomBytes(3).toString("hex");
const fixtures = [];

await connectDB();
await connectRedis();
try {
  const { deadlineTime } = await getDeadlineConfig();
  if (Date.now() > deadlineTime) throw new Error("Set a future deadline before creating load-test fixtures");
  for (let start = 0; start < count; start += 100) {
    const batch = Math.min(100, count - start);
    for (let offset = 0; offset < batch; offset++) {
      const n = start + offset;
      const userId = new mongoose.Types.ObjectId();
      const sessionId = crypto.randomUUID();
      const user = {
        _id: userId,
        name: `Load Participant ${n}`,
        email: `load-${runId}-${n}@example.test`,
        password: crypto.randomBytes(24).toString("hex"),
        globalRole: "Participant",
        role: "Participant",
      };
      const team = { _id: userId, name: `Load Team ${n}`, createdBy: userId };
      await Promise.all([User.create(user), Team.create(team)]);
      const sessionPayload = { user: { _id: userId.toString(), email: user.email, role: "Participant", globalRole: "Participant", name: user.name } };
      await redisClient.setEx(`session:${sessionId}`, 24 * 60 * 60, JSON.stringify(sessionPayload));
      fixtures.push({ token: sessionId, teamId: userId.toString(), n });
    }
    console.log(`Prepared ${Math.min(start + batch, count)} of ${count} test teams`);
  }
  const path = new URL("./load-fixtures.json", import.meta.url);
  await writeFile(path, JSON.stringify({ createdAt: new Date().toISOString(), fixtures }, null, 2));
  console.log(`Wrote ${fixtures.length} fixtures to ${path.pathname}`);
} finally {
  if (redisClient.isOpen) await redisClient.quit();
  await mongoose.connection.close();
}
