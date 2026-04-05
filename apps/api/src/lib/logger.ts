import {
  createAppLogger,
  createLoggerContext,
  createWideEventContext,
} from "@deadlock-mods/logging";
import type { NodeClient } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { version } from "../version";
import { env } from "./env";

export { createWideEvent, runWithWideEvent } from "@deadlock-mods/logging";

export const loggerContext = createLoggerContext();
export const wideEventContext = createWideEventContext();
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
