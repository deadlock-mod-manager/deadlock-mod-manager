import { setupInstrumentation } from "@deadlock-mods/instrumentation";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { NodeClient } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { SENTRY_OPTIONS } from "./lib/constants";
import { env } from "./lib/env";

Sentry.init({
  ...SENTRY_OPTIONS,
  skipOpenTelemetrySetup: true, // Skip OpenTelemetry setup, we'll use our own.
});

const sentryClient = Sentry.getClient<NodeClient>()!;

const sdk = setupInstrumentation("bot", sentryClient, [
  new LangfuseSpanProcessor({
    environment: env.NODE_ENV,
    secretKey: env.LANGFUSE_SECRET_KEY,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    shouldExportSpan: ({ otelSpan }) => {
      console.log(otelSpan.instrumentationScope.name, otelSpan.name);
      return (
        ["langfuse-sdk", "ai"].includes(otelSpan.instrumentationScope.name) ||
        otelSpan.name.startsWith("langchain")
      );
    },
    exportMode: "immediate",
  }),
]);
sdk.start();
