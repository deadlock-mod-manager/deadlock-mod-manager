import type { SapphireClient } from "@sapphire/framework";
import { featureFlagDefinitions } from "@/config/feature-flags";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { DocumentationSyncProcessor } from "@/processors/documentation-sync.processor";
import { cronService } from "@/services/cron";
import { FeatureFlagsService } from "@/services/feature-flags";
import { PatternSyncService } from "@/services/pattern-sync";
import { PromptSyncService } from "@/services/prompt-sync";

export class BotStartupService {
  async initialize(client: SapphireClient): Promise<void> {
    await this.syncPrompts();
    await this.bootstrapFeatureFlags();
    await this.initializePatternSync();
    await this.setupCronJobs();
    await this.loginToDiscord(client);
  }

  private async syncPrompts(): Promise<void> {
    const promptSync = new PromptSyncService();
    await promptSync.syncPrompts();
  }

  private async bootstrapFeatureFlags(): Promise<void> {
    logger.info("Registering feature flags");
    const bootstrapResult = await FeatureFlagsService.instance.bootstrap(
      featureFlagDefinitions,
    );

    if (bootstrapResult.isErr()) {
      logger
        .withError(bootstrapResult.error)
        .error("Failed to bootstrap feature flags");
    } else {
      logger
        .withMetadata({ successCount: bootstrapResult.value })
        .info("Feature flags bootstrapped successfully");
    }
  }

  private async initializePatternSync(): Promise<void> {
    logger.info("Syncing triage patterns");
    const patternSync = new PatternSyncService();

    try {
      await patternSync.sync();
    } catch (error) {
      logger
        .withError(error instanceof Error ? error : new Error(String(error)))
        .warn("Pattern sync failed, will retry periodically");
    }

    patternSync.syncPeriodically(6);
  }

  private async setupCronJobs(): Promise<void> {
    logger.info("Defining documentation sync cron job");
    await cronService.defineJob({
      name: DocumentationSyncProcessor.name,
      pattern: DocumentationSyncProcessor.cronPattern,
      processor: DocumentationSyncProcessor.instance,
      enabled: true,
    });
  }

  private async loginToDiscord(client: SapphireClient): Promise<void> {
    await client.login(env.BOT_TOKEN);
  }
}
