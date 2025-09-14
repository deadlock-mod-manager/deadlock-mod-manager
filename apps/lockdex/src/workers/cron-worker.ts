import { queueConfigs } from '@/config/queues';
import { logger } from '@/lib/logger';
import type { CronProcessor } from '@/processors/cron-processor';
import type { CronJobData } from '@/types/jobs';
import { BaseWorker } from './base';

export class CronWorker extends BaseWorker<CronJobData> {
  constructor(cronProcessor: CronProcessor, concurrency = 1) {
    super(queueConfigs.cron.name, logger, cronProcessor, concurrency);
  }
}
