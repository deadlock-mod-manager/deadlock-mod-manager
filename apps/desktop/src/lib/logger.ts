import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { BlankTransport, ConsoleTransport, LogLayer, LogLevel } from "loglayer";
import { serializeError } from "serialize-error";

const MAX_SHIPPED_MESSAGE_LENGTH = 2_048;

const canShipToTauriLogger = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const formatShippedMessage = (messages: readonly string[]): string => {
  const message = messages
    .join(" ")
    .replace(
      /\b(authorization|token|password|secret|api[_-]?key)(\s*[=:]\s*)\S+/gi,
      "$1$2[REDACTED]",
    )
    .replace(/:\/\/[^\s/:]+:[^\s/@]+@/g, "://[REDACTED]@")
    .replace(/\b[A-Za-z]:[\\/][^\s"'<>|]+/g, "<local-path>")
    .replace(/(^|\s)\/(?:[^\s/]+\/)*[^\s/]+/g, "$1<local-path>")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return message.slice(0, MAX_SHIPPED_MESSAGE_LENGTH);
};

const serializeKeyValues = (
  data: Record<string, unknown>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      key === "error" &&
      value &&
      typeof value === "object" &&
      "message" in value &&
      typeof value.message === "string"
    ) {
      const errorName =
        "name" in value && typeof value.name === "string"
          ? value.name
          : "Error";
      result[key] = formatShippedMessage([`${errorName}: ${value.message}`]);
      continue;
    }
    if (typeof value === "string") {
      result[key] = formatShippedMessage([value]);
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
  copyMsgOnOnlyError: true,
  errorFieldInMetadata: false,
  errorSerializer: serializeError,
  transport: [
    new ConsoleTransport({
      logger: console,
    }),
    new BlankTransport({
      shipToLogger: ({ logLevel, messages, data, hasData }) => {
        if (!canShipToTauriLogger()) {
          return messages;
        }

        const message =
          formatShippedMessage(messages) ||
          (logLevel === LogLevel.error
            ? "Frontend error (details preserved in structured metadata)"
            : "Frontend log event (details preserved in structured metadata)");
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
