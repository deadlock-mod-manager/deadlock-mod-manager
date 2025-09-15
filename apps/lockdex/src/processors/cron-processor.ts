import { logger } from '@/lib/logger';
import type { CronJobData } from '@/types/jobs';
import { BaseProcessor } from './base';

export class CronProcessor extends BaseProcessor<CronJobData> {
  async process(jobData: CronJobData) {
    logger.info(`Processing cron job: ${JSON.stringify(jobData)}`);
    return this.handleSuccess(jobData);
  }
}
