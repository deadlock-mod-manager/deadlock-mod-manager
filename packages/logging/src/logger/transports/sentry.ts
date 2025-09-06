import {
  LoggerlessTransport,
  type LoggerlessTransportConfig,
  type LogLayerTransportParams,
  LogLevel,
} from '@loglayer/transport';
import type {
  NodeClient as SentryNodeClient,
  SeverityLevel,
} from '@sentry/node';
import * as Sentry from '@sentry/node';
import { omit } from 'lodash';
import { deserializeError } from 'serialize-error';

export interface SentryTransportConfig extends LoggerlessTransportConfig {
  sentryClient: SentryNodeClient;
}

export class SentryTransport extends LoggerlessTransport implements Disposable {
  private readonly sentryClient: SentryNodeClient;
  private isDisposed = false;

  constructor(config: SentryTransportConfig) {
    super(config);
    this.sentryClient = config.sentryClient;
  }

  shipToLogger({ logLevel, messages, data, hasData }: LogLayerTransportParams) {
    if (
      this.isDisposed ||
      ![LogLevel.fatal, LogLevel.error].includes(logLevel as LogLevel)
    ) {
      return messages;
    }
    Sentry.withScope((scope) => {
      const metadata = hasData && data ? data : {};
      const error =
        'error' in metadata ? deserializeError(metadata.error) : undefined;

      scope.setLevel(logLevel as SeverityLevel);
      scope.setContext('metadata', omit(metadata, 'error', 'data'));

      if ('userId' in metadata) {
        scope.setUser({ id: metadata.userId });
      }

      if (error && !('skipSentry' in metadata)) {
        this.sentryClient.captureException(error, undefined, scope);
      }
    });

    return messages;
  }

  [Symbol.dispose](): void {
    if (this.isDisposed) {
      return;
    }

    // Clean up resources
    this.sentryClient?.close();
    this.isDisposed = true;
  }
}
