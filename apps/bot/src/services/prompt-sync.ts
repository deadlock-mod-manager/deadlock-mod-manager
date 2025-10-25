import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPPORT_BOT_PROMPT_NAME } from "@/ai/prompts/support-bot";
import { env } from "@/lib/env";
import { langfuse } from "@/lib/langfuse";
import { logger } from "@/lib/logger";

export class PromptSyncService {
  async syncPrompts(): Promise<void> {
    logger.info("Starting prompt sync to Langfuse");

    try {
      await this.syncSupportBotPrompt();
      logger.info("Prompt sync completed successfully");
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .warn("Failed to sync prompts to Langfuse (continuing anyway)");
    }
  }

  private async syncSupportBotPrompt(): Promise<void> {
    const promptPath = join(__dirname, "../ai/prompts/support-bot.md");
    const promptContent = await readFile(promptPath, "utf-8");

    try {
      const currentPrompt = await langfuse.prompt.get(SUPPORT_BOT_PROMPT_NAME);

      if (currentPrompt.prompt === promptContent) {
        logger
          .withMetadata({ promptName: SUPPORT_BOT_PROMPT_NAME })
          .info("Prompt unchanged, skipping sync");
        return;
      }

      logger
        .withMetadata({ promptName: SUPPORT_BOT_PROMPT_NAME })
        .info("Prompt changed, creating new version");
    } catch (error) {
      logger
        .withMetadata({ promptName: SUPPORT_BOT_PROMPT_NAME })
        .info("No existing prompt found, creating initial version");
    }

    await langfuse.prompt.create({
      name: SUPPORT_BOT_PROMPT_NAME,
      prompt: promptContent,
      labels: ["support", "bot", env.NODE_ENV],
    });

    logger
      .withMetadata({ promptName: SUPPORT_BOT_PROMPT_NAME })
      .info("Synced prompt to Langfuse");
  }
}
