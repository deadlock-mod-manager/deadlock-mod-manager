import { setupInstrumentation } from "@deadlock-mods/instrumentation";
import type { NodeClient } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { SENTRY_OPTIONS } from "./lib/constants";

Sentry.init({
  ...SENTRY_OPTIONS,
});
const sentryClient = Sentry.getClient<NodeClient>()!;
const sdk = setupInstrumentation("mirror-service", sentryClient);

sdk.start();
