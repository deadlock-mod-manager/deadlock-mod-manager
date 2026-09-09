import { version } from "@/version";
import { env } from "./env";

export const SENTRY_OPTIONS = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 0.01,
  release: `mirror-service@${version}`,
  skipOpenTelemetrySetup: true, // Skip OpenTelemetry setup, we'll use our own.
};

export enum MonitorSlug {
  MIRROR_SYNC = "mirror-sync",
}

export const SERVER_TIMEZONE = env.TZ;
