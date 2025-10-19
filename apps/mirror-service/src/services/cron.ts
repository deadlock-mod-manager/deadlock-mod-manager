import { CronService } from "@deadlock-mods/queue/cron";
import { queueConfigs } from "@/config/queues";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

export const cronService = new CronService(
  queueConfigs.cron.name,
  redis,
  logger,
);
