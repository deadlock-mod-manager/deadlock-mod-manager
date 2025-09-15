import { ValidationError } from '@deadlock-mods/common';
import { modDownloadRepository, modRepository } from '@deadlock-mods/database';
import { logger } from '@/lib/logger';
import { queueService } from '@/services/queue';
import type { ModFileProcessingJobData, ModsJobData } from '@/types/jobs';
import { BaseProcessor } from './base';

export class ModProcessor extends BaseProcessor<ModsJobData> {
  constructor() {
    super(logger);
  }

  async process(jobData: ModsJobData) {
    try {
      const mod = await modRepository.findById(jobData.modId);
      if (!mod) {
        return this.handleError(new ValidationError('Mod not found'));
      }
      const downloads = await modDownloadRepository.findByModId(mod.id);
      if (!downloads || downloads.length === 0) {
        return this.handleError(new ValidationError('No downloads found'));
      }

      const payload = downloads.map(
        (download) =>
          ({
            modId: mod.id,
            modDownloadId: download.id,
            url: download.url,
            file: download.file,
            size: download.size,
          }) satisfies ModFileProcessingJobData
      );

      await queueService.addModFileProcessingJobs(payload);
      this.logger.info(`Added ${payload.length} mod file processing jobs`);

      return this.handleSuccess(jobData);
    } catch (error) {
      this.logger.withError(error).error('Error processing mod');
      return this.handleError(error as Error);
    }
  }
}
