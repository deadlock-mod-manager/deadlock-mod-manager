export interface CronJobData {
  timezone?: string;
  endDate?: Date;
  limit?: number;
  jobData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
