import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from "@opentelemetry/core";
import { NodeSDK } from "@opentelemetry/sdk-node";
import * as Sentry from "@sentry/node";
import {
  SentryPropagator,
  SentrySampler,
  SentrySpanProcessor,
} from "@sentry/opentelemetry";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { version } from "./version";

const sentryClient = Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  release: `bot@${version}`,
  skipOpenTelemetrySetup: true,
  tracesSampleRate: 1,
})!;

const sdk = new NodeSDK({
  serviceName: "bot",
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

sdk.start();
logger.info("Instrumentation started");
