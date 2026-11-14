import redisClient from "../config/redis.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rateLimitScript = await readFile(fileURLToPath(new URL("../script/rateLimiter.lua", import.meta.url)), "utf-8");

export default function rateLimiter({ limit, window }) {
  return async function (req, res, next) {
    const timestamp = Math.floor(Date.now() / 1000);
    const identifier = req.user?._id ?? req.ip;
    const windowId = Math.floor(timestamp / window);
    const previousWindowId = windowId - 1;
    const key = `rate:${identifier}:${windowId}`;
    const previousKey = `rate:${identifier}:${previousWindowId}`;
    const windowStart = windowId * window;
    const elapsed = timestamp - windowStart;
    try {
      const result = await redisClient.eval(rateLimitScript, {
        keys: [key, previousKey],
        arguments: [String(limit), String(window), String(elapsed)],
      });
      if (result === -1) {
        return res.status(429).json({ message: "Too many Requests" });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
