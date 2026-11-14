import { getIoRedisConnection } from "./config/redis.js";
const connection = getIoRedisConnection();

async function flush() {
  console.log("Flushing BullMQ keys...");
  await connection.flushdb();
  console.log("Done. Queue is clean.");
  process.exit(0);
}
flush();
