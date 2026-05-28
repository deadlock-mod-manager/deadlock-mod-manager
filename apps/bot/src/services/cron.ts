import { CronService } from "@deadlock-mods/queue/cron";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

export const cronService = new CronService("bot-cron-queue", redis, logger);
