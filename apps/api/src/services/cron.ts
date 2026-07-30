import { createCronService } from "@deadlock-mods/queue/cron";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

export const cronService = createCronService("api", redis, logger);
