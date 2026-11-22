export interface ProcessorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  /** False when another attempt cannot succeed, so the job fails without retrying */
  retryable?: boolean;
}
