import { createAppLogger } from "@deadlock-mods/logging";

/**
 * Logger instance for the CLI
 */
export const logger = createAppLogger({
  app: "dmodpkg-cli",
});
