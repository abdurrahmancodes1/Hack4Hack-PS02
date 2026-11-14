// queues/submissionQueue.js
import { Queue } from "bullmq";
import { getIoRedisConnection } from "../config/redis.js";

export const SUBMISSION_QUEUE_NAME = "submission-validation";

let queue;
export const getSubmissionQueue = () => {
  if (!queue) {
    queue = new Queue(SUBMISSION_QUEUE_NAME, {
      connection: getIoRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
  }
  return queue;
};
