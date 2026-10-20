import { analytics, captureMilestone } from "@/lib/analytics";
import { failureOutcome } from "@/lib/analytics/client";
import { isTauriError } from "@/types/tauri";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { useStartGame } from "@/components/providers/launch-repair";
import { useConfirm } from "@/components/providers/alert-dialog";
import { MOD_PATHS_KEY } from "@/hooks/use-game-config-alert";
import { useCompatibilityReview } from "@/components/providers/compatibility-review";
import { stopHeroDetection } from "@/hooks/use-hero-detection";
import { useLaunchFixes } from "@/hooks/use-launch-fixes";
import { useSkinRandomizer } from "@/hooks/use-skin-randomizer";
import { restoreProfileGameinfo } from "@/lib/gameinfo";
import { getLaunchErrorMessage } from "@/lib/launch-error";
import { type LaunchStep, useLaunchProgress } from "@/lib/launch-progress";
import { launchWithCompatibilityReview } from "@/lib/launch-with-compatibility-review";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/launch-options";
import { ModStatus } from "@/types/mods";
import { invokeGuarded } from "@/lib/game-guard";

// The game is already running when the last step finishes, so the finished
// checklist only stays up long enough to read.
const FINISHED_STEPS_MS = 1200;

const BACKEND_TAIL: LaunchStep[] = [
  "applyingPerformance",
  "openingSteam",
  "waitingForGame",
];

export const useLaunch = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.settings);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const localMods = usePersistedStore((s) => s.localMods);
  const isModEnabledInCurrentProfile = usePersistedStore(
    (s) => s.isModEnabledInCurrentProfile,
  );
  const setModStatus = usePersistedStore((s) => s.setModStatus);
  const setModEnabledInCurrentProfile = usePersistedStore(
    (s) => s.setModEnabledInCurrentProfile,
  );
  const clearLastJoin = usePersistedStore((s) => s.clearLastJoin);
  const setLastLaunchVanilla = usePersistedStore((s) => s.setLastLaunchVanilla);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const startGame = useStartGame();
  const { randomizeSkins } = useSkinRandomizer();
  const reviewCompatibility = useCompatibilityReview();
  const prepareModFixes = useLaunchFixes();
  const {
    begin: beginLaunch,
    start: startProgress,
    advance,
    clear: clearProgress,
  } = useLaunchProgress();
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
    beginLaunch();
    try {
      await checkMapCommandInAutoexec();
      await disableInstalledMapMods();
      const modCount = vanilla
        ? 0
        : usePersistedStore.getState().getEnabledModsCount();
      const backendSteps: LaunchStep[] = vanilla
        ? ["disablingMods", ...BACKEND_TAIL]
        : [
            "verifyingMods",
            "mergingModData",
            "writingSearchPaths",
            ...BACKEND_TAIL,
          ];
      const randomizesSkins =
        !vanilla && usePersistedStore.getState().skinRandomizerEnabled;
      startProgress(
        randomizesSkins ? ["randomizingSkins", ...backendSteps] : backendSteps,
        modCount,
      );
      // A vanilla launch loads no mods, so there is nothing to dress up.
      if (!vanilla) {
        await randomizeSkins();
      }

      const activeProfile = getActiveProfile();
      const profileFolder = vanilla
        ? null
        : (activeProfile?.folderName ?? null);

      // Dialogs replace the checklist; starting the game brings it back.
      if (!vanilla && !(await prepareModFixes(profileFolder, clearProgress))) {
        clearProgress();
        logger.info("Launch cancelled at the mod fix prompt");
        attempt.finish("cancelled");
        return;
      }

      if (await restoreProfileGameinfo(profileFolder)) {
        clearLastJoin();
      }

      stopHeroDetection();

      const unlistenReset = await listen("gameinfo-auto-reset", () => {
        toast.info(t("common.gameinfoAutoReset"));
      });
      const unlistenProgress = await listen<LaunchStep>(
        "launch-progress",
        (event) => advance(event.payload),
      );

      let launched = false;
      try {
        const args = {
          vanilla,
          additionalArgs:
            vanilla && launchVanillaNoArgs ? "" : await getAdditionalArgs(),
          profileFolder,
        };
        launched = await launchWithCompatibilityReview(
          async () => {
            if (useLaunchProgress.getState().cancelled) return false;
            // Shows the checklist again when a launch resumes after review.
            if (!useLaunchProgress.getState().progress) {
              startProgress(backendSteps, modCount);
            }
            return startGame(args);
          },
          () => {
            // The review dialog takes over until it launches or is closed.
            clearProgress();
            return reviewCompatibility(profileFolder);
          },
          vanilla,
        );
      } finally {
        unlistenReset();
        unlistenProgress();
      }
      if (!launched) {
        clearProgress();
        logger
          .withMetadata({ vanilla })
          .info("Launch cancelled before the game started");
        attempt.finish("cancelled");
        return;
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
      advance(null);
      setTimeout(clearProgress, FINISHED_STEPS_MS);
      await queryClient.invalidateQueries({
        queryKey: ["is-game-running"],
      });
      await queryClient.invalidateQueries({ queryKey: MOD_PATHS_KEY });
    } catch (error) {
      clearProgress();
      attempt.finish(
        failureOutcome(isTauriError(error) ? error.kind : undefined),
      );
      if (isTauriError(error) && error.kind === "launchCancelled") {
        logger.info("Launch cancelled while waiting for the game");
        return;
      }
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
