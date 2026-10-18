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
    // A retry would race the next scheduled run for the sync lock, and the
    // first run after a fresh deploy sweeps every mod for over an hour. The
    // schedule is the retry.
    jobOptions: { attempts: 1 },
  },
  {
    name: RelayDiscoveryProcessor.name,
    pattern: RelayDiscoveryProcessor.cronPattern,
    processor: RelayDiscoveryProcessor.getInstance(),
    enabled: true,
  },
];
