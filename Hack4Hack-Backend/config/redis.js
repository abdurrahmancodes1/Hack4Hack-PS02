import { createClient } from "redis";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || (process.env.REDIS_HOST
  ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
  : "redis://127.0.0.1:6379");

// Node Redis client (controllers and session middleware)
const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err.message);
});

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log("Redis connected");
  }
}

// BullMQ connection
export const getIoRedisConnection = () => {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
};

export default redisClient;
