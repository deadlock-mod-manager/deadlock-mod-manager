import { analytics, captureMilestone } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { isTauriError } from "@/types/tauri";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { MOD_PATHS_KEY } from "@/hooks/use-game-config-alert";
import { useCompatibilityReview } from "@/components/providers/compatibility-review";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { stopHeroDetection } from "@/hooks/use-hero-detection";
import { useSkinRandomizer } from "@/hooks/use-skin-randomizer";
import { restoreProfileGameinfo } from "@/lib/gameinfo";
import { getLaunchErrorMessage } from "@/lib/launch-error";
import { launchWithCompatibilityReview } from "@/lib/launch-with-compatibility-review";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

export const useLaunch = () => {
  const { t } = useTranslation();
  const {
    settings,
    gamePresenceEnabled,
    getActiveProfile,
    localMods,
    isModEnabledInCurrentProfile,
    setModStatus,
    setModEnabledInCurrentProfile,
  } = usePersistedStore();
  const clearLastJoin = usePersistedStore((s) => s.clearLastJoin);
  const setLastLaunchVanilla = usePersistedStore((s) => s.setLastLaunchVanilla);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { randomizeSkins } = useSkinRandomizer();
  const reviewCompatibility = useCompatibilityReview();
  const modCompatibility = useExperimentalFeature("mod-compatibility-repairs");
  const launchVanillaNoArgs =
    settings?.["launch-vanilla-no-args"]?.enabled ?? false;

  const checkMapCommandInAutoexec = async () => {
    try {
      const mapName = await invoke<string | null>(
        "get_map_command_from_autoexec",
      );
      if (!mapName) return;

      const shouldRemove = await confirm({
        title: t("warnings.mapCommandInAutoexec.title"),
        body: t("warnings.mapCommandInAutoexec.body", { mapName }),
        actionButton: t("warnings.mapCommandInAutoexec.removeAndLaunch"),
        cancelButton: t("warnings.mapCommandInAutoexec.launchAnyway"),
      });

      if (shouldRemove) {
        await invoke("remove_map_command_from_autoexec");
      }
    } catch {
      // Autoexec check is best-effort; don't block game launch
    }
  };

  const disableInstalledMapMods = async () => {
    const installedMapMods = localMods.filter(
      (mod) =>
        mod.isMap &&
        mod.status === ModStatus.Installed &&
        isModEnabledInCurrentProfile(mod.remoteId),
    );

    if (installedMapMods.length === 0) return;

    const modNames = installedMapMods.map((mod) => mod.name).join(", ");

    const shouldDisable = await confirm({
      title: t("warnings.mapModsInstalled.title"),
      body: t("warnings.mapModsInstalled.body", { modNames }),
      actionButton: t("warnings.mapModsInstalled.disableAndLaunch"),
      cancelButton: t("warnings.mapModsInstalled.launchAnyway"),
    });

    if (shouldDisable) {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      for (const mapMod of installedMapMods) {
        await invokeGuarded("uninstall_mod", {
          modId: mapMod.remoteId,
          vpks: mapMod.installedVpks ?? [],
          profileFolder,
        });
        setModStatus(mapMod.remoteId, ModStatus.Downloaded);
        setModEnabledInCurrentProfile(mapMod.remoteId, false);
      }
    }
  };

  const launch = async (vanilla = false) => {
    const attempt = analytics.start("game_launch", {
      launch_mode: vanilla ? "vanilla" : "modded",
    });
    try {
      await checkMapCommandInAutoexec();
      await disableInstalledMapMods();
      // A vanilla launch loads no mods, so there is nothing to dress up.
      if (!vanilla) {
        await randomizeSkins();
      }

      const activeProfile = getActiveProfile();
      const profileFolder = vanilla
        ? null
        : (activeProfile?.folderName ?? null);

      if (await restoreProfileGameinfo(profileFolder)) {
        clearLastJoin();
      }

      stopHeroDetection();

      const unlisten = await listen("gameinfo-auto-reset", () => {
        toast.info(t("common.gameinfoAutoReset"));
      });

      try {
        const args = {
          vanilla,
          additionalArgs:
            vanilla && launchVanillaNoArgs
              ? ""
              : await getAdditionalArgs(
                  Object.values(settings),
                  gamePresenceEnabled,
                ),
          profileFolder,
          modCompatibility,
        };
        await launchWithCompatibilityReview(
          () => invoke<void>("start_game", args),
          () => reviewCompatibility(profileFolder),
          vanilla || !modCompatibility,
        );
      } finally {
        unlisten();
      }

      const state = usePersistedStore.getState();
      const enabledModCount = vanilla
        ? 0
        : state.localMods.filter(
            (mod) =>
              mod.status === ModStatus.Installed &&
              state.isModEnabledInCurrentProfile(mod.remoteId),
          ).length;
      if (
        attempt.finish("completed", { enabled_mod_count: enabledModCount }) &&
        enabledModCount > 0
      ) {
        captureMilestone("first_modded_launch");
      }
      setLastLaunchVanilla(vanilla);
      await queryClient.invalidateQueries({
        queryKey: ["is-game-running"],
      });
      await queryClient.invalidateQueries({ queryKey: MOD_PATHS_KEY });
    } catch (error) {
      attempt.finish(
        failureOutcome(isTauriError(error) ? error.kind : undefined),
      );
      console.error(error);
      logger.errorOnly(error);
      if (isTauriError(error) && error.kind === "modDataReviewRequired") {
        toast.error(t("errors.modDataReviewRequired"));
        return;
      }
      toast.error(
        getLaunchErrorMessage(
          error,
          t("errors.gameLaunchFailed"),
          t("errors.genericMessage"),
        ),
      );
    }
  };

  return { launch };
};
