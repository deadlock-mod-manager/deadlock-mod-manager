import type { Logger } from "@deadlock-mods/logging";
import type { ProcessorResult } from "../types/processors";

export abstract class BaseProcessor<T> {
  protected logger: Logger;

  protected constructor(logger: Logger) {
    this.logger = logger.child().withContext({
      processor: this.constructor.name,
    });
  }

  abstract process(jobData: T): Promise<ProcessorResult>;

  protected handleError(
    error: Error,
    options: { retryable?: boolean } = {},
  ): ProcessorResult {
    return {
      success: false,
      error: error.message,
      retryable: options.retryable,
    };
  }

  protected handleSuccess(data?: unknown): ProcessorResult {
    return {
      success: true,
      data,
    };
  }
}
