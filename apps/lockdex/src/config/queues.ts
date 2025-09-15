import type { QueueConfig } from '@/types/queue';

export const queueConfigs: Record<string, QueueConfig> = {
  mods: {
    name: 'mods-queue',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
  cron: {
    name: 'cron-queue',
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 50,
      removeOnFail: 25,
    },
  },
  // email: {
  //   name: 'email-queue',
  //   defaultJobOptions: {
  //     attempts: 3,
  //     backoff: {
  //       type: 'exponential',
  //       delay: 2000,
  //     },
  //     removeOnComplete: 100,
  //     removeOnFail: 50,
  //   },
  // },
  // image: {
  //   name: 'image-processing-queue',
  //   defaultJobOptions: {
  //     attempts: 5,
  //     backoff: {
  //       type: 'exponential',
  //       delay: 5000,
  //     },
  //     removeOnComplete: 50,
  //     removeOnFail: 25,
  //   },
  // },
};
