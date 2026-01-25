#!/usr/bin/env bun
import * as _instrument from "../instrument";
import { SupportAgent } from "@/ai/agents/support";
import { logger } from "@/lib/logger";

const testMessages = [
  "Hello, how are you?",
  "What is your name?",
  "Can you remember what I just asked you?",
];

const main = async () => {
  const supportAgent = new SupportAgent();

  const userId = "test-user-1234567890";
  const channelId = "test-channel-1234567890";
  const sessionId = `${userId}-${channelId}`;
  const userMention = `<@${userId}>`;

  logger.info("Starting chat history test with multiple messages");

  for (const [index, message] of testMessages.entries()) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Message ${index + 1}/${testMessages.length}: ${message}`);
    console.log("=".repeat(60));

    const result = await supportAgent.invoke(
      message,
      sessionId,
      userId,
      ["support"],
      channelId,
      userMention,
    );

    const success = await result.match(
      (response) => {
        logger
          .withMetadata({
            messageIndex: index + 1,
            responseLength: response.length,
          })
          .info("Support agent response received");

        console.log("\n--- Response ---");
        console.log(response);
        console.log("----------------\n");

        return true;
      },
      (error) => {
        logger.withError(error).error("Error invoking support agent");
        return false;
      },
    );

    if (!success) {
      console.error(`Failed at message ${index + 1}`);
      process.exit(1);
    }

    if (index < testMessages.length - 1) {
      console.log("Waiting 1 second before next message...\n");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.info("Chat history test completed successfully");
  console.log("\n✓ All messages processed successfully");
  console.log("✓ Chat history should contain context from previous messages");
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Error starting the script");
    process.exit(1);
  });
}
