import { createAppLogger, createLoggerContext } from "@deadlock-mods/logging";
import type { NodeClient } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { version } from "../version";
import { env } from "./env";

export const loggerContext = createLoggerContext();
const sentryClient = Sentry.getClient<NodeClient>();

export const logger = createAppLogger({
  app: "api",
  environment: env.NODE_ENV,
  version,
  context: loggerContext,
  options: {
    sentryClient,
  },
});
