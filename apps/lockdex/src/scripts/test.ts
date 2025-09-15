import { logger } from '@/lib/logger';
import { ModProcessor } from '@/processors/mod-processor';
import type { ModsJobData } from '@/types/jobs';

const main = async () => {
  logger.info('Test script');
  const modsProcessor = new ModProcessor();
  const jobData: ModsJobData = {
    modId: 'mod_75b96624-1609-4e3e-9c5e-9a4cc32130ca',
    metadata: {},
  };
  const result = await modsProcessor.process(jobData);
  logger.info(`Result: ${JSON.stringify(result)}`);
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error('Something went wrong');
    process.exit(1);
  });
}
