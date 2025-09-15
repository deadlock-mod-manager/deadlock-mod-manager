import type { ProcessorResult } from '@/types/processors';

export abstract class BaseProcessor<T> {
  abstract process(jobData: T): Promise<ProcessorResult>;

  protected handleError(error: Error): ProcessorResult {
    return {
      success: false,
      error: error.message,
    };
  }

  protected handleSuccess(data?: unknown): ProcessorResult {
    return {
      success: true,
      data,
    };
  }
}
