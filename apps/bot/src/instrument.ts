import { LangfuseSpanProcessor } from "@langfuse/otel";
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
  spanProcessors: [
    new SentrySpanProcessor(),
    new LangfuseSpanProcessor({
      environment: env.NODE_ENV,
      secretKey: env.LANGFUSE_SECRET_KEY,
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
      shouldExportSpan: ({ otelSpan }) => {
        return ["langfuse-sdk", "ai", "langchain"].includes(
          otelSpan.instrumentationScope.name,
        );
      },
      exportMode: "immediate",
    }),
  ],
});

sdk.start();
logger.info("Instrumentation started");
