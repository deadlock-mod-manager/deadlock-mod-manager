import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { BlankTransport, ConsoleTransport, LogLayer, LogLevel } from "loglayer";
import { serializeError } from "serialize-error";

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
        const message = messages
          .join(" ") // + (hasData ? JSON.stringify(data) : "")
          .trim();
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
