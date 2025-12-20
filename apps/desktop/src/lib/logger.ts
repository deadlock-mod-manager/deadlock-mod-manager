import { debug, error, info, trace, warn } from "@tauri-apps/plugin-log";
import { BlankTransport, ConsoleTransport, LogLayer, LogLevel } from "loglayer";
import { serializeError } from "serialize-error";

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
          keyValues: data && hasData ? data : undefined,
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
