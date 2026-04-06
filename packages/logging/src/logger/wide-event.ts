import { AsyncLocalStorage } from "node:async_hooks";
import type { ILogLayer } from "loglayer";

type Logger = ILogLayer;

export interface WideEvent {
  set(key: string, value: unknown): void;
  merge(data: Record<string, unknown>): void;
  emit(outcome?: "success" | "error", error?: unknown): void;
}

export const createWideEvent = (
  logger: Logger,
  operation: string,
  initialContext?: Record<string, unknown>,
): WideEvent => {
  const startTime = Date.now();
  const event: Record<string, unknown> = {
    operation,
    ...initialContext,
  };
  let emitted = false;

  return {
    set(key, value) {
      event[key] = value;
    },
    merge(data) {
      Object.assign(event, data);
    },
    emit(outcome = "success", error) {
      if (emitted) return;
      emitted = true;
      event.outcome = outcome;
      event.duration_ms = Date.now() - startTime;
      if (error) {
        logger.withError(error).withMetadata(event).error(operation);
      } else {
        logger.withMetadata(event).info(operation);
      }
    },
  };
};

export const createWideEventContext = () => {
  const storage = new AsyncLocalStorage<WideEvent>();
  return {
    storage,
    run<T>(wideEvent: WideEvent, fn: () => T): T {
      return storage.run(wideEvent, fn);
    },
    get(): WideEvent | undefined {
      return storage.getStore();
    },
  };
};

export type WideEventContext = ReturnType<typeof createWideEventContext>;

export const runWithWideEvent = <T = void>(
  ctx: WideEventContext,
  logger: Logger,
  operation: string,
  initialContext: Record<string, unknown>,
  fn: (wide: WideEvent) => Promise<T>,
): Promise<T> => {
  const wide = createWideEvent(logger, operation, initialContext);
  return ctx.run(wide, async () => {
    try {
      const result = await fn(wide);
      wide.emit("success");
      return result;
    } catch (error) {
      wide.emit("error", error);
      throw error;
    }
  });
};
