import { NotFoundError } from "@deadlock-mods/common";
import type { BaseProcessor } from "./processor";

export type ProcessorResolver<T> = (
  jobName: string,
) => BaseProcessor<T> | undefined;

export const resolveProcessorOrThrow = <T>(
  resolveProcessor: ProcessorResolver<T>,
  jobName: string,
  queueName: string,
): BaseProcessor<T> => {
  const processor = resolveProcessor(jobName);

  if (!processor) {
    throw new NotFoundError(
      `No processor registered for job "${jobName}" on queue "${queueName}"`,
    );
  }

  return processor;
};

export const toProcessorResolver = <T>(
  processor: BaseProcessor<T> | ProcessorResolver<T>,
): ProcessorResolver<T> =>
  typeof processor === "function" ? processor : () => processor;
