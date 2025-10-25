import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { NodeClient } from "@sentry/node";
import * as Sentry from "@sentry/node";
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry";

export const setupInstrumentation = (
  serviceName: string,
  sentryClient: NodeClient,
): NodeSDK => {
  const sdk = new NodeSDK({
    serviceName,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-pg": {
          enabled: true,
          enhancedDatabaseReporting: true,
        },
        "@opentelemetry/instrumentation-http": {
          enabled: false,
        },
      }),
    ],
    contextManager: new Sentry.SentryContextManager(),
    textMapPropagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new SentryPropagator()],
    }),
    sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
    spanProcessors: [new SentrySpanProcessor()],
  });

  return sdk;
};
