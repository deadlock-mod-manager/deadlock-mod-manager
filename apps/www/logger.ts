import { createAppLogger } from "@deadlock-mods/logging";
import { env } from "./env";
import { version } from "./version";

export const logger = createAppLogger({
  app: "www",
  environment: env.NODE_ENV,
  version,
});
