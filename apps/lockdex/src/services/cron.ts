import { CronService } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "@/config/queues";
import { logger } from "@/lib/logger";
import redis from "@/lib/redis";

export const cronService = new CronService(
  queueConfigs.cron.name,
  redis,
  logger,
  // One slot per defined job so a slow job cannot starve the others
  2,
  { defaultJobOptions: queueConfigs.cron.defaultJobOptions },
);
