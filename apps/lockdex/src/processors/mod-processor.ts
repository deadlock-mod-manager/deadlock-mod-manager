import type { ModsJobData } from '@/types/jobs';
import { BaseProcessor } from './base';

export class ModProcessor extends BaseProcessor<ModsJobData> {
  async process(jobData: ModsJobData) {
    return this.handleSuccess(jobData);
  }
}
