import logfmt from "logfmt";

export interface LogComponents {
  message: unknown;
  meta: Record<string, unknown>;
  error?: unknown;
}

export interface LogMessage {
  error?: LogMessageError;
  [key: string]: unknown;
}

export interface LogMessageError {
  stack?: string;
  name?: string;
  message?: string;
}

export const formatError = (error: LogMessageError | undefined) => {
  if (!error) return "";
  return `error=${error?.name} error.message=${error?.message} error.stack=${error?.stack}`;
};

export const isMessageObject = (value: unknown): value is LogMessage =>
  value !== null && typeof value === "object";

export const formatLogComponents = ({
  message,
  meta,
  error: initialError,
  seenKeys = new Set<string>(),
}: LogComponents & { seenKeys?: Set<string> }) => {
  let formattedMessage = "";
  let formattedMetadata = "";
  let error = initialError as LogMessageError | undefined;

  if (isMessageObject(message)) {
    // eslint-disable-next-line no-console
    console.error(error); // Explicitly log full error object
    error = message.error;

    const { error: _, ...metadata } = message;

    // Filter metadata to remove already seen keys
    const filteredMetadata = Object.entries(metadata).reduce(
      (acc, [key, value]) => {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    try {
      const logfmtResult = logfmt.stringify(filteredMetadata);
      if (logfmtResult.includes("[object Object]")) {
        formattedMetadata = JSON.stringify(filteredMetadata, null, 2);
      } else {
        formattedMetadata = logfmtResult;
      }
    } catch {
      formattedMetadata = JSON.stringify(filteredMetadata, null, 2);
    }
    formattedMessage = error?.message ?? "An error occurred";
  } else {
    formattedMessage = String(message);

    // Remove duplicate keys from meta
    const filteredMeta = Object.entries(meta).reduce(
      (acc, [key, value]) => {
        // Skip special symbols
        if (typeof key === "symbol") return acc;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    try {
      const logfmtResult = logfmt.stringify(filteredMeta);
      if (logfmtResult.includes("[object Object]")) {
        formattedMetadata = JSON.stringify(filteredMeta, null, 2);
      } else {
        formattedMetadata = logfmtResult;
      }
    } catch {
      formattedMetadata = JSON.stringify(filteredMeta, null, 2);
    }
  }

  return {
    formattedMessage,
    formattedMetadata,
    formattedError: formatError(error),
  };
};
