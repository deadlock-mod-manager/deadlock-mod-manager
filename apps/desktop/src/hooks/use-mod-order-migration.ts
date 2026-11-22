import { useEffect } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

export const useModOrderMigration = () => {
  const localMods = usePersistedStore((s) => s.localMods);
  const migrateLegacyMods = usePersistedStore((s) => s.migrateLegacyMods);

  useEffect(() => {
    const installedMods = localMods.filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    );

    const needsMigration = installedMods.some(
      (mod) => mod.installOrder === undefined,
    );

    if (needsMigration && installedMods.length > 0) {
      logger
        .withMetadata({
          totalMods: localMods.length,
          installedMods: installedMods.length,
          modsToMigrate: installedMods.filter(
            (mod) => mod.installOrder === undefined,
          ).length,
        })
        .info(
          "Detected installed mods without install order, starting migration",
        );

      migrateLegacyMods();
    }
  }, [localMods, migrateLegacyMods]);
};
