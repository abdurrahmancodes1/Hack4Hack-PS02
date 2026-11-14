import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/mongoose.js";
import redisClient, { connectRedis } from "../config/redis.js";
import { startValidationWorker } from "../workers/validationWorker.js";

await connectDB();
await connectRedis();
const worker = startValidationWorker();
await worker.waitUntilReady();
console.log("Standalone validation worker is ready.");

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await worker.close();
  if (redisClient.isOpen) await redisClient.quit();
  await mongoose.connection.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
