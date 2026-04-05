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

export interface FormattedError {
  headline: string;
  stackLines: string[];
}

export const formatError = (
  error: LogMessageError | undefined,
): FormattedError | null => {
  if (!error) return null;
  const name = error.name ?? "Error";
  const message = error.message ?? "Unknown error";
  const headline = `${name}: ${message}`;

  const stackLines: string[] = [];
  if (error.stack) {
    for (const line of error.stack.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("at ")) {
        stackLines.push(trimmed);
      }
    }
  }

  return { headline, stackLines };
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
    error = message.error;

    const { error: _, ...metadata } = message;

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

    const filteredMeta = Object.entries(meta).reduce(
      (acc, [key, value]) => {
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
