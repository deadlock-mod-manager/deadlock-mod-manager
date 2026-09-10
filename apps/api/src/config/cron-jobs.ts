import type { CronJobDefinition } from "@deadlock-mods/queue/cron";
import { ModsSyncProcessor } from "@/processors/mods-sync";
import { RelayDiscoveryProcessor } from "@/processors/relay-discovery";

/** Every job carried by the API cron queue. */
export const cronJobDefinitions: CronJobDefinition[] = [
  {
    name: ModsSyncProcessor.name,
    pattern: ModsSyncProcessor.cronPattern,
    processor: ModsSyncProcessor.getInstance(),
    enabled: true,
    // A full sweep runs for over an hour, so a retry would overlap the next
    // scheduled run and deadlock on the sync lock. The schedule is the retry.
    jobOptions: { attempts: 1 },
  },
  {
    name: RelayDiscoveryProcessor.name,
    pattern: RelayDiscoveryProcessor.cronPattern,
    processor: RelayDiscoveryProcessor.getInstance(),
    enabled: true,
  },
];
