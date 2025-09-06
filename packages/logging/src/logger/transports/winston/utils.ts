import logfmt from 'logfmt';

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

export const formatError = (error: LogMessageError | undefined) =>
  error?.stack ? `\n${error.stack}` : '';

export const isMessageObject = (value: unknown): value is LogMessage =>
  value !== null && typeof value === 'object';

export const formatLogComponents = ({
  message,
  meta,
  error: initialError,
  seenKeys = new Set<string>(),
}: LogComponents & { seenKeys?: Set<string> }) => {
  let formattedMessage = '';
  let formattedMetadata = '';
  let error = initialError as LogMessageError | undefined;

  if (isMessageObject(message)) {
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
      {} as Record<string, unknown>
    );

    formattedMetadata = logfmt.stringify(filteredMetadata);
    formattedMessage = error?.message ?? 'An error occurred';
  } else {
    formattedMessage = String(message);

    // Remove duplicate keys from meta
    const filteredMeta = Object.entries(meta).reduce(
      (acc, [key, value]) => {
        // Skip special symbols
        if (typeof key === 'symbol') return acc;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>
    );

    formattedMetadata = logfmt.stringify(filteredMeta);
  }

  return {
    formattedMessage,
    formattedMetadata,
    formattedError: formatError(error),
  };
};
