import { NotFoundError } from "@deadlock-mods/common";
import type { BaseProcessor } from "./processor";

/**
 * Resolves the processor responsible for a given job name. Queues that carry
 * more than one kind of job must supply a resolver so a job is never handed to
 * the wrong processor.
 */
export type ProcessorResolver<T> = (
  jobName: string,
) => BaseProcessor<T> | undefined;

/**
 * BullMQ workers claim any job on their queue regardless of its name, so the
 * name is what decides who runs it. An unresolvable name has to fail loudly:
 * falling back to whichever processor is attached is how a queue silently runs
 * jobs through the wrong handler.
 */
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
