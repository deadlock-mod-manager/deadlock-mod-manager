import type { ErrorHandler, MiddlewareHandler } from "hono";
import type { Logger, LoggerContext } from "../logger";
import type { WideEventContext } from "../logger/wide-event";
import type { AppEnv } from "./app-env";
import {
  createRequestLogger,
  type RequestLoggerOptions,
} from "./request-logger";

export type ObservabilityStackOptions = {
  logger: Logger;
  loggerContext: LoggerContext<{ requestId: string }>;
  wideEventContext: WideEventContext;
  requestLogger?: RequestLoggerOptions;
};

export const createObservabilityStack = (
  options: ObservabilityStackOptions,
) => {
  const loggerContextMiddleware: MiddlewareHandler<AppEnv> = async (
    c,
    next,
  ) => {
    await options.loggerContext.storage.run(
      { requestId: c.get("requestId") },
      async () => {
        await next();
      },
    );
  };

  const requestLogger = createRequestLogger({
    logger: options.logger,
    wideEventContext: options.wideEventContext,
    ...options.requestLogger,
  });

  const onError: ErrorHandler<AppEnv> = (error, c) => {
    const wideEvent = c.get("wideEvent");

    if (wideEvent) {
      wideEvent.set("status_code", 500);
      wideEvent.emit("error", error);
    } else {
      options.logger
        .withError(error)
        .withMetadata({
          method: c.req.method,
          path: c.req.path,
          requestId: c.get("requestId"),
          statusCode: 500,
        })
        .error("Request failed");
    }

    return c.json({ error: "Internal Server Error" }, 500);
  };

  return {
    loggerContextMiddleware,
    requestLogger,
    onError,
  };
};
