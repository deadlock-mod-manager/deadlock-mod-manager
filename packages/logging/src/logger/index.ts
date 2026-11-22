import { AsyncLocalStorage } from "node:async_hooks";
import { openTelemetryPlugin } from "@loglayer/plugin-opentelemetry";
import type { NodeClient as SentryNodeClient } from "@sentry/node";
import type { ILogLayer, LogLayerConfig } from "loglayer";
import { LogLayer, MockLogLayer } from "loglayer";
import { serializeError } from "serialize-error";
import { SentryTransport } from "./transports/sentry";
import {
  createWinstonTransport,
  type WinstonTransportOptions,
} from "./transports/winston";

export type MessageDataType = string | number | boolean | null | undefined;
export const createMockLogger = () => new MockLogLayer();

export type Logger = ILogLayer;

export type LoggerOptions<C extends Record<string, unknown>> =
  Partial<LogLayerConfig> & {
    transportOptions?: WinstonTransportOptions;
    context?: C;
    sentryClient?: SentryNodeClient;
  };

const createLogger = <C extends Record<string, unknown>>(
  options?: LoggerOptions<C>,
  context?: LoggerContext<C>,
) => {
  const { transport } = createWinstonTransport(options?.transportOptions);

  const storeContextPlugin = () => ({
    // biome-ignore lint/suspicious/noExplicitAny: Library type
    onBeforeDataOut(params: { data?: Record<string, any> | undefined }) {
      const store = context?.storage.getStore();
      return {
        ...params?.data,
        ...store,
      };
    },
  });

  const openTelemetryPlugins =
    process.env?.NODE_ENV !== "development"
      ? [
          openTelemetryPlugin({
            traceFieldName: "traceId",
            spanIdFieldName: "spanId",
            traceFlagsFieldName: "traceFlags",
          }),
        ]
      : [];

  return new LogLayer({
    enabled: process.env?.NODE_ENV !== "test",
    consoleDebug: false,

    transport: [
      transport,
      ...(options?.sentryClient
        ? [new SentryTransport({ sentryClient: options?.sentryClient })]
        : []),
    ],

    errorFieldName: "error",
    copyMsgOnOnlyError: false,
    errorFieldInMetadata: false,
    errorSerializer: serializeError,

    plugins: [...openTelemetryPlugins, storeContextPlugin()],
    ...options,
  });
};

export const createLoggerContext = <
  T extends Record<string, unknown> = {
    requestId: string;
  },
>() => {
  const storage: AsyncLocalStorage<T> = new AsyncLocalStorage();
  return {
    storage,
  };
};

export type LoggerContext<T extends Record<string, unknown>> = ReturnType<
  typeof createLoggerContext<T>
>;

export const createAppLogger = <C extends Record<string, unknown>>({
  app,
  version,
  environment,
  options,
  context,
}: {
  app: string;
  version?: string;
  environment?: string;
  options?: LoggerOptions<C>;
  context?: LoggerContext<C>;
}) => {
  const logger = createLogger(options, context).withContext({
    app,
    ...(version && { version }),
    ...(environment && { environment }),
  });

  return logger;
};

export * from "./wide-event";
