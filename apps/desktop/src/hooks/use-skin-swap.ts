import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type UseInstallActionReturn,
  useInstallAction,
} from "@/hooks/use-install-action";
import useUninstall from "@/hooks/use-uninstall";
import { isGameRunning } from "@/lib/tauri-commands";
import logger from "@/lib/logger";
import { groupSkinsByHero } from "@/lib/mods/skin-selection";
import { swapHeroSkin } from "@/lib/mods/skin-swap";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

const isStillInstalled = (remoteId: string): boolean =>
  usePersistedStore
    .getState()
    .localMods.find((mod) => mod.remoteId === remoteId)?.status ===
  ModStatus.Installed;

export const useSkinSwap = (): {
  selectSkin: (hero: string, target: LocalMod | null) => Promise<void>;
  swappingHero: string | null;
  installAction: UseInstallActionReturn;
} => {
  const { t } = useTranslation();
  const { uninstall } = useUninstall();
  const installAction = useInstallAction();
  const [swappingHero, setSwappingHero] = useState<string | null>(null);

  const selectSkin = useCallback(
    async (hero: string, target: LocalMod | null) => {
      if (swappingHero !== null) {
        return;
      }
      setSwappingHero(hero);
      try {
        // Read the store fresh so a conflicted state (two installed skins) is
        // fully collapsed even if the rendered props were stale.
        const active =
          groupSkinsByHero(usePersistedStore.getState().localMods).get(hero)
            ?.active ?? [];

        const result = await swapHeroSkin(active, target, {
          uninstall: async (mod) => {
            await uninstall(mod, false);
            return !isStillInstalled(mod.remoteId);
          },
          install: async (mod) => {
            await installAction.performInstall(mod);

            const status = usePersistedStore
              .getState()
              .localMods.find((m) => m.remoteId === mod.remoteId)?.status;

            if (status !== ModStatus.Installing) {
              return status === ModStatus.Installed;
            }

            return new Promise<boolean>((resolve) => {
              const unsubscribe = usePersistedStore.subscribe((state) => {
                const status = state.localMods.find(
                  (m) => m.remoteId === mod.remoteId,
                )?.status;
                if (status !== ModStatus.Installing) {
                  unsubscribe();
                  resolve(status === ModStatus.Installed);
                }
              });
            });
          },
        });

        if (result === "swapped" || result === "reset") {
          const gameRunning = await isGameRunning().catch(() => false);
          if (gameRunning) {
            toast.info(t("skins.restartHint"));
          }
        }
      } catch (error) {
        logger.errorOnly(error);
        toast.error(t("skins.swapFailed"));
      } finally {
        setSwappingHero(null);
      }
    },
    [swappingHero, uninstall, installAction, t],
  );

  return { selectSkin, swappingHero, installAction };
};
