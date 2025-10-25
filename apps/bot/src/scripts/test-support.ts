#!/usr/bin/env bun
import "../instrument";
import { SupportAgent } from "@/ai/agents/support";
import { logger } from "@/lib/logger";

const main = async () => {
  const supportAgent = new SupportAgent();

  const result = await supportAgent.invoke(
    "Hello, how are you?",
    "1234567890" + Date.now().toString(),
    "1234567890" + Date.now().toString(),
    ["support"],
  );

  result.match(
    (response) => {
      logger
        .withMetadata({
          responseLength: response.length,
        })
        .info("Support agent response received");
    },
    (error) => {
      logger.withError(error).error("Error invoking support agent");
      process.exit(1);
    },
  );
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the script");
    process.exit(1);
  });
}
