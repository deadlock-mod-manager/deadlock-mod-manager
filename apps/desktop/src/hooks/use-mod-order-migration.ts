import { useEffect } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

/**
 * Hook to handle migration of legacy mods without install order
 * This runs once when the app starts and ensures all mods have an install order
 */
export const useModOrderMigration = () => {
  const { localMods, migrateLegacyMods } = usePersistedStore();

  useEffect(() => {
    // Only check installed mods for migration
    const installedMods = localMods.filter(
      (mod) =>
        mod.status === ModStatus.Installed &&
        mod.installedVpks &&
        mod.installedVpks.length > 0,
    );

    // Check if any installed mods need migration (don't have installOrder)
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
