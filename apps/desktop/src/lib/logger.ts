import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { BlankTransport, ConsoleTransport, LogLayer, LogLevel } from "loglayer";
import { serializeError } from "serialize-error";
import { z } from "zod";

const errorSummarySchema = z.union([
  z.string(),
  z
    .object({
      name: z.string().optional(),
      message: z.string().optional(),
    })
    .transform(({ name, message }) =>
      message ? `${name ?? "Error"}: ${message}` : (name ?? "Error"),
    ),
]);

const summarizeError = <T>(value: T): string => {
  if (value == null) return "";
  const parsed = errorSummarySchema.safeParse(value);
  const summary = parsed.success ? parsed.data : "";
  return summary.length > 2048 ? `${summary.slice(0, 2047)}…` : summary;
};

const serializeKeyValues = (
  data: Record<string, unknown>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (value === null || value === undefined) {
      result[key] = String(value);
    } else if (typeof value === "object") {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }
  return result;
};

const logger = new LogLayer({
  errorFieldName: "error",
  copyMsgOnOnlyError: false,
  errorFieldInMetadata: false,
  errorSerializer: serializeError,
  transport: [
    new ConsoleTransport({
      logger: console,
    }),
    new BlankTransport({
      shipToLogger: ({ logLevel, messages, data, hasData }) => {
        if (
          typeof window === "undefined" ||
          !("__TAURI_INTERNALS__" in window)
        ) {
          return messages;
        }

        const message = [messages.join(" ").trim(), summarizeError(data?.error)]
          .filter(Boolean)
          .join(" ");
        const options = {
          keyValues: data && hasData ? serializeKeyValues(data) : undefined,
        };
        switch (logLevel) {
          case LogLevel.debug:
            debug(message, options);
            break;
          case LogLevel.error:
            error(message, options);
            break;
          case LogLevel.info:
            info(message, options);
            break;
          case LogLevel.trace:
            trace(message, options);
            break;
          case LogLevel.warn:
            warn(message, options);
            break;
        }
        return messages;
      },
    }),
  ],
});

export const createLogger = (name: string) => {
  return logger.child().withContext({
    module: name,
  });
};

export default logger;
