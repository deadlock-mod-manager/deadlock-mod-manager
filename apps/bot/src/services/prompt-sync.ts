import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPPORT_BOT_PROMPT_NAME } from "@/ai/prompts/support-bot";
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

    await langfuse.createPrompt({
      name: SUPPORT_BOT_PROMPT_NAME,
      prompt: promptContent,
      config: {
        model: "gpt-4o",
        temperature: 0.7,
      },
      labels: ["support", "bot"],
    });

    logger
      .withMetadata({ promptName: SUPPORT_BOT_PROMPT_NAME })
      .info("Synced prompt to Langfuse");
  }
}
