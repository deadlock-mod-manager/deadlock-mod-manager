export interface BaseJobData {
  metadata?: Record<string, unknown>;
}

export enum JobStatus {
  Pending = "pending",
  Processing = "processing",
  Completed = "completed",
  Failed = "failed",
}

export interface ModsJobData extends BaseJobData {
  modId: string;
}

export interface ModFileProcessingJobData extends BaseJobData {
  modId: string;
  modDownloadId: string;
  url: string;
  file: string;
  size: number;
}

export interface CronJobData extends BaseJobData {
  cronPattern?: string;
  timezone?: string;
  endDate?: Date;
  limit?: number;
  jobData: Record<string, unknown>;
}
