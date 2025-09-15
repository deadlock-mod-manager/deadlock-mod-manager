import { modRepository } from '@deadlock-mods/database';
import { logger } from '@/lib/logger';
import { queueService } from '@/services/queue';
import type { CronJobData } from '@/types/jobs';
import { CronProcessor } from './cron-processor';

export class ModsSchedulerProcessor extends CronProcessor {
  constructor() {
    super(logger);
  }

  async process(jobData: CronJobData) {
    try {
      logger.info(`Processing mods scheduler job: ${JSON.stringify(jobData)}`);
      const mods = await modRepository.findAll();
      logger.info(`Found ${mods.length} mods, scheduling them for processing`);

      for (const mod of mods) {
        await queueService.addModProcessingJob({
          modId: mod.id,
        });
        logger.info(`Scheduled mod ${mod.id} for processing`);
      }
      return this.handleSuccess(jobData);
    } catch (error) {
      logger.withError(error).error('Error processing mods scheduler job');
      return this.handleError(error as Error);
    }
  }
}
