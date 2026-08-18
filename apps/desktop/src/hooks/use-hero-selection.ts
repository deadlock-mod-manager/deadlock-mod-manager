import { toast } from "@deadlock-mods/ui/components/sonner";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type UseInstallActionReturn,
  useInstallAction,
} from "@/hooks/use-install-action";
import useUninstall from "@/hooks/use-uninstall";
import logger from "@/lib/logger";
import { groupModsByHero, type HeroModKind } from "@/lib/mods/hero-mods";
import {
  applyHeroSelection,
  type HeroSelectionDeps,
  nextHeroSelection,
} from "@/lib/mods/hero-selection";
import { usePersistedStore } from "@/lib/store";
import { isGameRunning } from "@/lib/tauri-commands";
import { type LocalMod, ModStatus } from "@/types/mods";

const isStillInstalled = (remoteId: string): boolean =>
  usePersistedStore
    .getState()
    .localMods.find((mod) => mod.remoteId === remoteId)?.status ===
  ModStatus.Installed;

/**
 * Both hooks below report back whether the install or uninstall actually landed:
 * the underlying actions swallow their own failures into a toast, so the store
 * is the only honest answer.
 */
const selectionDeps = (
  uninstall: (mod: LocalMod, remove: boolean) => Promise<void>,
  performInstall: (mod: LocalMod) => Promise<void>,
): HeroSelectionDeps<LocalMod> => ({
  uninstall: async (mod) => {
    await uninstall(mod, false);
    return !isStillInstalled(mod.remoteId);
  },
  install: async (mod) => {
    await performInstall(mod);

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

export const useHeroSelection = (): {
  select: (
    hero: string,
    target: LocalMod | null,
    kind: HeroModKind,
  ) => Promise<void>;
  remove: (hero: string, mod: LocalMod) => Promise<void>;
  busyHero: string | null;
  installAction: UseInstallActionReturn;
} => {
  const { t } = useTranslation();
  const { uninstall } = useUninstall();
  const installAction = useInstallAction();
  const hideHeroMod = usePersistedStore((state) => state.hideHeroMod);
  const [busyHero, setBusyHero] = useState<string | null>(null);
  // Two clicks in the same render both read the same `busyHero`, so the state
  // alone cannot keep a second swap out while the first is still running.
  const busyRef = useRef<string | null>(null);

  const beginBusy = useCallback((hero: string) => {
    if (busyRef.current !== null) {
      return false;
    }
    busyRef.current = hero;
    setBusyHero(hero);
    return true;
  }, []);

  const endBusy = useCallback(() => {
    busyRef.current = null;
    setBusyHero(null);
  }, []);

  const select = useCallback(
    async (hero: string, target: LocalMod | null, kind: HeroModKind) => {
      if (!beginBusy(hero)) {
        return;
      }
      try {
        // Read the store fresh so a conflicted state (several installed skins)
        // is fully collapsed even if the rendered props were stale.
        const state = usePersistedStore.getState();
        const group = groupModsByHero(state.localMods, {
          includeExtras: state.heroExtrasEnabled,
          hidden: new Set(Object.keys(state.hiddenHeroMods)),
        }).get(hero);

        // Extras stack on top of a skin rather than replacing it, so the two
        // kinds never take each other's place.
        const active =
          (kind === "skin" ? group?.activeSkins : group?.activeExtras) ?? [];
        const mode =
          kind === "skin" && !state.multipleSkinsEnabled
            ? "exclusive"
            : "toggle";

        const result = await applyHeroSelection(
          active,
          nextHeroSelection(active, target, mode),
          selectionDeps(uninstall, installAction.performInstall),
        );

        if (result === "applied") {
          const gameRunning = await isGameRunning().catch(() => false);
          if (gameRunning) {
            toast.info(t("skins.restartHint"));
          }
        } else if (result === "aborted") {
          toast.error(t("skins.swapFailed"));
        }
      } catch (error) {
        logger.errorOnly(error);
        toast.error(t("skins.swapFailed"));
      } finally {
        endBusy();
      }
    },
    [beginBusy, endBusy, uninstall, installAction, t],
  );

  /**
   * Takes an entry off a hero's list while leaving it in the library. It is
   * switched off on the way out: a hidden entry that stayed installed would
   * leave the hero changed in game with nothing left on the page to undo it.
   */
  const remove = useCallback(
    async (hero: string, mod: LocalMod) => {
      if (!beginBusy(hero)) {
        return;
      }
      try {
        if (mod.status === ModStatus.Installed) {
          const result = await applyHeroSelection(
            [mod],
            [],
            selectionDeps(uninstall, installAction.performInstall),
          );
          if (result === "aborted") {
            // The uninstall already said what went wrong.
            return;
          }
        }
        hideHeroMod(mod.remoteId);
        toast.success(t("skins.removeFromHeroSuccess", { mod: mod.name }));
      } catch (error) {
        logger.errorOnly(error);
        toast.error(t("skins.swapFailed"));
      } finally {
        endBusy();
      }
    },
    [beginBusy, endBusy, uninstall, installAction, hideHeroMod, t],
  );

  return { select, remove, busyHero, installAction };
};
