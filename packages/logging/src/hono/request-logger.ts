import type { MiddlewareHandler } from "hono";
import type { Logger } from "../logger";
import { createWideEvent, type WideEventContext } from "../logger/wide-event";
import type { AppEnv } from "./app-env";

export type RequestLoggerOptions = {
  excludePaths?: readonly string[];
  excludePathPrefixes?: readonly string[];
};

type CreateRequestLoggerOptions = RequestLoggerOptions & {
  logger: Logger;
  wideEventContext: WideEventContext;
};

const isExcludedPath = (
  path: string,
  excludePaths: readonly string[],
  excludePathPrefixes: readonly string[],
): boolean => {
  if (excludePaths.includes(path)) {
    return true;
  }

  return excludePathPrefixes.some((prefix) => path.startsWith(prefix));
};

export const createRequestLogger = (
  options: CreateRequestLoggerOptions,
): MiddlewareHandler<AppEnv> => {
  const excludePaths = options.excludePaths ?? [];
  const excludePathPrefixes = options.excludePathPrefixes ?? [];

  return async (c, next) => {
    if (isExcludedPath(c.req.path, excludePaths, excludePathPrefixes)) {
      return next();
    }

    const wide = createWideEvent(options.logger, "http_request", {
      method: c.req.method,
      path: c.req.path,
      userAgent: c.req.header("user-agent"),
      requestId: c.get("requestId"),
    });

    c.set("wideEvent", wide);

    await options.wideEventContext.run(wide, async () => {
      try {
        await next();
        wide.set("status_code", c.res.status);
        wide.emit("success");
      } catch (error) {
        wide.set("status_code", 500);
        throw error;
      }
    });
  };
};
