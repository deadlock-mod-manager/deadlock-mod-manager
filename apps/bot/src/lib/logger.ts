import { createAppLogger, createLoggerContext } from "@deadlock-mods/logging";
import type { NodeClient } from "@sentry/bun";
import * as Sentry from "@sentry/bun";
import { version } from "../version";
import { env } from "./env";

export const loggerContext = createLoggerContext();
const sentryClient = Sentry.getClient<NodeClient>();

export const logger = createAppLogger({
  app: "bot",
  environment: env.NODE_ENV,
  version,
  context: loggerContext,
  options: {
    sentryClient,
  },
});
