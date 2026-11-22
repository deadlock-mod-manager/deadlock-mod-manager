import type { CronJobDefinition } from "@deadlock-mods/queue/cron";
import { ModsSyncProcessor } from "@/processors/mods-sync";
import { OAuthTokenCleanupProcessor } from "@/processors/oauth-token-cleanup";
import { RelayDiscoveryProcessor } from "@/processors/relay-discovery";

export const cronJobDefinitions: CronJobDefinition[] = [
  {
    name: ModsSyncProcessor.name,
    pattern: ModsSyncProcessor.cronPattern,
    processor: ModsSyncProcessor.getInstance(),
    enabled: true,
    jobOptions: { attempts: 1 },
  },
  {
    name: OAuthTokenCleanupProcessor.name,
    pattern: OAuthTokenCleanupProcessor.cronPattern,
    processor: OAuthTokenCleanupProcessor.getInstance(),
    enabled: true,
  },
  {
    name: RelayDiscoveryProcessor.name,
    pattern: RelayDiscoveryProcessor.cronPattern,
    processor: RelayDiscoveryProcessor.getInstance(),
    enabled: false,
  },
];
