#!/usr/bin/env bun
// oxlint-disable import/no-unassigned-import
import "../instrument";
import { logger } from "@/lib/logger";
import { MessageTriageService } from "@/services/message-triage";
import { PatternSyncService } from "@/services/pattern-sync";

const testMessages = [
  {
    content: "The mod manager crashes when I try to enable multiple mods",
    expectedType: "bug_report",
  },
  {
    content:
      "I'm getting an error message that says 'Failed to load mod configuration'",
    expectedType: "bug_report",
  },
  {
    content: "How do I install mods using the mod manager?",
    expectedType: "help_request",
  },
  {
    content: "Can someone help me with configuring the settings?",
    expectedType: "help_request",
  },
  {
    content: "Hey everyone, how are you doing today?",
    expectedType: "normal",
  },
  {
    content: "Thanks for the help!",
    expectedType: "normal",
  },
  {
    content:
      "The application freezes after I click the download button and won't respond",
    expectedType: "bug_report",
  },
  {
    content: "What's the best way to organize my mods?",
    expectedType: "help_request",
  },
];

const main = async () => {
  logger.info("Starting message triage test");

  logger.info("Step 1: Syncing patterns from MD file");
  const patternSync = new PatternSyncService();
  try {
    const syncResult = await patternSync.sync();
    logger.withMetadata(syncResult).info("Pattern sync completed successfully");
  } catch (error) {
    logger.withError(error).error("Pattern sync failed");
    process.exit(1);
  }

  logger.info("Step 2: Initializing message triage service");
  const triageService = new MessageTriageService();
  try {
    await triageService.initialize();
    logger.info("Message triage service initialized");
  } catch (error) {
    logger.withError(error).error("Failed to initialize triage service");
    process.exit(1);
  }

  logger.info("Step 3: Testing message classification");

  let successCount = 0;
  let failureCount = 0;

  for (const [index, testCase] of testMessages.entries()) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Test ${index + 1}/${testMessages.length}`);
    console.log("=".repeat(80));
    console.log(`Message: ${testCase.content}`);
    console.log(`Expected: ${testCase.expectedType}`);

    const result = await triageService.classifyMessage(
      testCase.content,
      `test-user-${index}`,
    );

    if (!result.success) {
      console.log(`❌ Classification failed: ${result.reason}`);
      failureCount++;
      continue;
    }

    console.log(`Actual: ${result.result.type}`);
    console.log(`Confidence: ${result.result.confidence.toFixed(4)}`);
    if (result.result.suggestedChannelId) {
      console.log(`Suggested Channel: ${result.result.suggestedChannelId}`);
    }

    const isCorrect = result.result.type === testCase.expectedType;
    if (isCorrect) {
      console.log("✅ PASS");
      successCount++;
    } else {
      console.log("❌ FAIL");
      failureCount++;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("Test Summary");
  console.log("=".repeat(80));
  console.log(`Total: ${testMessages.length}`);
  console.log(`Passed: ${successCount}`);
  console.log(`Failed: ${failureCount}`);
  console.log(
    `Success Rate: ${((successCount / testMessages.length) * 100).toFixed(1)}%`,
  );

  if (failureCount === 0) {
    logger.info("All tests passed successfully");
  } else {
    logger.warn(`${failureCount} tests failed`);
  }
};

if (import.meta.main) {
  main().catch((error) => {
    logger.withError(error).error("Test script failed");
    process.exit(1);
  });
}
