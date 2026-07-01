import type { QueueConfig } from "@deadlock-mods/queue";

export const queueConfigs: Record<string, QueueConfig> = {
  cron: {
    name: "bot-cron-queue",
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 25,
    },
  },
};
