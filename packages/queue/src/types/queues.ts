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

export interface QueueConnectionConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  enableReadyCheck?: boolean;
}
