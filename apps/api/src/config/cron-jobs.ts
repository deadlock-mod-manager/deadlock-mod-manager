import type { CronJobDefinition } from "@deadlock-mods/queue/cron";
import { RelayDiscoveryProcessor } from "@/processors/relay-discovery";

/** Every job carried by the API cron queue. */
export const cronJobDefinitions: CronJobDefinition[] = [
  {
    name: RelayDiscoveryProcessor.name,
    pattern: RelayDiscoveryProcessor.cronPattern,
    processor: RelayDiscoveryProcessor.getInstance(),
    enabled: true,
  },
];
