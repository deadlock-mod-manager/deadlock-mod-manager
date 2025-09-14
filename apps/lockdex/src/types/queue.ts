export interface QueueConfig {
  name: string;
  defaultJobOptions?: {
    delay?: number;
    attempts?: number;
    backoff?: {
      type: string;
      delay: number;
    };
    removeOnComplete?: number;
    removeOnFail?: number;
  };
}
