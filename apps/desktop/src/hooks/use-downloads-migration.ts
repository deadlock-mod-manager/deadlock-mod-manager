import { useEffect, useRef } from "react";
import { getModDownloads } from "@/lib/api-client";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

const logger = createLogger("downloads-migration");

const CONCURRENCY = 3;

const fetchInBatches = async (
  remoteIds: string[],
  onResult: (
    remoteId: string,
    downloads: {
      name: string;
      url: string;
      size: number;
      description?: string;
    }[],
  ) => void,
) => {
  let cursor = 0;
  const run = async () => {
    while (cursor < remoteIds.length) {
      const id = remoteIds[cursor++];
      try {
        const result = await getModDownloads(id);
        if (result.downloads.length > 0) {
          onResult(id, result.downloads);
        }
      } catch {
        logger
          .withMetadata({ modId: id })
          .warn("Failed to fetch downloads for migration, skipping");
      }
    }
  };
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, remoteIds.length) },
    () => run(),
  );
  await Promise.allSettled(workers);
};

export const useDownloadsMigration = () => {
  const localMods = usePersistedStore((state) => state.localMods);
  const setModDownloads = usePersistedStore((state) => state.setModDownloads);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;

    const modsNeedingMigration = localMods.filter(
      (mod) =>
        mod.remoteId &&
        !mod.remoteId.includes("local") &&
        (!mod.downloads || mod.downloads.length === 0),
    );

    if (modsNeedingMigration.length === 0) return;
    didRun.current = true;

    logger
      .withMetadata({ count: modsNeedingMigration.length })
      .info("Starting downloads backfill migration");

    const remoteIds = modsNeedingMigration.map((m) => m.remoteId);

    fetchInBatches(remoteIds, (remoteId, downloads) => {
      setModDownloads(remoteId, downloads);
    }).then(() => {
      logger.info("Downloads backfill migration complete");
    });
  }, [localMods, setModDownloads]);
};
