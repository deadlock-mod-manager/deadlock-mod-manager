import { queueConfigs } from '@/config/queues';
import { logger } from '@/lib/logger';
import type { ModProcessor } from '@/processors/mod-processor';
import type { ModsJobData } from '@/types/jobs';
import { BaseWorker } from './base';

export class ModsWorker extends BaseWorker<ModsJobData> {
  constructor(modProcessor: ModProcessor, concurrency = 1) {
    super(queueConfigs.mods.name, logger, modProcessor, concurrency);
  }
}
