import { BaseProcessor } from "@deadlock-mods/queue";
import { CronPatterns } from "@deadlock-mods/queue/cron";
import { logger } from "@/lib/logger";
import { NightlyTestersSyncService } from "@/services/nightly-testers-sync";
import type { CronJobData } from "@/types/jobs";

export class NightlyTestersSyncProcessor extends BaseProcessor<CronJobData> {
  static #instance: NightlyTestersSyncProcessor | null = null;
  private readonly syncService: NightlyTestersSyncService;

  static readonly cronPattern = CronPatterns.DAILY;

  private constructor() {
    super(logger);
    this.syncService = NightlyTestersSyncService.getInstance();
  }

  static get instance() {
    if (!NightlyTestersSyncProcessor.#instance) {
      NightlyTestersSyncProcessor.#instance = new NightlyTestersSyncProcessor();
    }
    return NightlyTestersSyncProcessor.#instance;
  }

  async process(jobData: CronJobData) {
    try {
      await this.syncService.sync();
      return this.handleSuccess(jobData);
    } catch (error) {
      logger.withError(error).error("Nightly testers sync job failed");
      return this.handleError(error as Error);
    }
  }
}
