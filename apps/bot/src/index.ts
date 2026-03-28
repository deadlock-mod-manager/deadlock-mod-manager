// oxlint-disable import/no-unassigned-import
import "./instrument";

import { logger } from "@/lib/logger";
import { Orchestrator } from "./orchestrator";

const main = async () => {
  const orchestrator = new Orchestrator();
  await orchestrator.run();
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the bot");
    process.exit(1);
  });
}
