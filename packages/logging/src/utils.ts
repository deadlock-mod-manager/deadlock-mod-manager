import { CONSOLE_METHODS } from './constants';
import type { Logger } from './logger';

/**
 * Create a console method that logs to LogLayer
 */
export const createConsoleMethod = (
  logger: Logger,
  method: 'error' | 'info' | 'warn' | 'debug' | 'log'
) => {
  const mappedMethod = method === 'log' ? 'info' : method;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: don't care lol
  return (...args: unknown[]) => {
    try {
      const data: Record<string, unknown> = {};
      let hasData = false;
      let error: Error | null = null;
      const messages: string[] = [];

      for (const arg of args) {
        if (arg instanceof Error) {
          error = arg;
          continue;
        }

        if (typeof arg === 'object' && arg !== null) {
          Object.assign(data, arg);
          hasData = true;
          continue;
        }

        if (typeof arg === 'string') {
          messages.push(arg);
        }
      }

      let finalMessage = messages.join(' ').trim();

      // next.js uses an "x" for the error message when it's an error object
      if (finalMessage === '⨯' && error) {
        finalMessage = error?.message || '';
      }

      if (error && hasData && messages.length > 0) {
        logger.withError(error).withMetadata(data)[mappedMethod](finalMessage);
      } else if (error && messages.length > 0) {
        logger.withError(error)[mappedMethod](finalMessage);
      } else if (hasData && messages.length > 0) {
        logger.withMetadata(data)[mappedMethod](finalMessage);
      } else if (error && hasData && messages.length === 0) {
        logger.withError(error).withMetadata(data)[mappedMethod]('');
      } else if (error && messages.length === 0) {
        logger.errorOnly(error);
      } else if (hasData && messages.length === 0) {
        logger.metadataOnly(data);
      } else {
        logger[mappedMethod](finalMessage);
      }
    } catch (error) {
      logger.withError(error).error('Error creating console method');
    }
  };
};

/**
 * Replace the console methods with the custom logger methods
 */
export const replaceConsoleMethods = (logger: Logger) => {
  Object.assign(console, {
    ...Object.fromEntries(
      CONSOLE_METHODS.map((method) => [
        method,
        createConsoleMethod(logger, method),
      ])
    ),
  });
};
