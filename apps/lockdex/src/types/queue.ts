export interface QueueConfig {
  name: string;
  defaultJobOptions?: {
    delay?: number;
    attempts?: number;
    backoff?: {
      type: string;
      delay: number;
    };
    timeout?: number;
    removeOnComplete?: number;
    removeOnFail?: number;
  };
}
