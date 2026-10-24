import { toast } from "@deadlock-mods/ui/components/sonner";
import { TooltipProvider } from "@deadlock-mods/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
import { FontInstallDialog } from "./components/downloads/font-install-dialog";
import { ProgressProvider } from "./components/downloads/progress-indicator";
import { ForgeInstallRenderer } from "./components/forge-install-renderer";
import { GameGuardRenderer } from "./components/game-guard-renderer";
import { LaunchHealthRenderer } from "./components/launch-health/launch-health-renderer";
import { ModHealthRenderer } from "./components/mod-health/mod-health-renderer";
import { FoundryProvider } from "./components/foundry/foundry-context";
import { GamePresenceRenderer } from "./components/game-presence-renderer";
import { MatchSyncNoticeDialog } from "./components/match-sync/match-sync-notice-dialog";
import { MatchSyncRenderer } from "./components/match-sync-renderer";
import GlobalPluginRenderer from "./components/global-plugin-renderer";
import { UpdateDialog } from "./components/layout/update-dialog";
import { TauriAppWindowProvider } from "./components/layout/window-controls/window-context";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard";
import { PerformanceRenderer } from "./components/performance/performance-renderer";
import { TelemetryConsentDialog } from "./components/telemetry/telemetry-consent-dialog";
import { LaunchRepairProvider } from "./components/providers/launch-repair";
import { FilePermissionsRenderer } from "./components/file-permissions-renderer";
import { AlertDialogProvider } from "./components/providers/alert-dialog";
import { ModelConflictProvider } from "./components/providers/model-conflict";
import { invokeGuarded, isGameRunningError } from "@/lib/game-guard";
import { AppProvider } from "./components/providers/app";
import { CompatibilityReviewProvider } from "./components/providers/compatibility-review";
import { ThemeProvider } from "./components/providers/theme";
import { ThemeOverridesProvider } from "./components/providers/theme-overrides";
import { AnalyticsProvider } from "./contexts/analytics-context";
import { useAutoUpdate } from "./hooks/use-auto-update";
import { useCrosshairConfigReconciliation } from "./hooks/use-crosshair-config-reconciliation";
import { useGameinfoAutoReset } from "./hooks/use-gameinfo-auto-reset";
import { useDeepLink, useOneClickInstall } from "./hooks/use-deep-link";
import { RemoteInstallPairDialog } from "./components/remote-install-pair-dialog";
import { useIngestToolInit } from "./hooks/use-ingest-tool-init";
import { useLanguageListener } from "./hooks/use-language-listener";
import { useMissingVpkDetection } from "./hooks/use-missing-vpk-detection";
import { useDownloadsMigration } from "./hooks/use-downloads-migration";
import { useHeroDetection } from "./hooks/use-hero-detection";
import { useGameBananaCatalogSync } from "./hooks/use-gamebanana-catalog-sync";
import { useModOrderMigration } from "./hooks/use-mod-order-migration";
import { useRemoteInstallPoll } from "./hooks/use-remote-install";
import { Layout } from "./layout";
import { queryClient } from "./lib/client";
import { downloadManager } from "./lib/download/manager";
import logger from "./lib/logger";
import type { RuntimeBootstrap } from "./lib/runtime-bootstrap";
import type { StorageReadyStatus } from "./lib/store/storage";
import type { FontInfo } from "./types/mods";
import { usePerfBackgroundSync } from "@/hooks/performance/use-perf-background-sync";

interface PendingFontInstall {
  modId: string;
  fonts: FontInfo[];
}

type AppProps = {
  runtime: RuntimeBootstrap;
  storage: StorageReadyStatus;
};

// Deep links install mods, which can open conflict and game-guard dialogs, so
// the listener must mount inside their providers rather than in App itself.
const DeepLinkListener = () => {
  const installFromLink = useOneClickInstall();
  useDeepLink(installFromLink);
  useRemoteInstallPoll(installFromLink);
  return null;
};

const App = ({ runtime, storage }: AppProps) => {
  const integrations = runtime.integrations;
  useLanguageListener();
  useModOrderMigration();
  useDownloadsMigration();
  useCrosshairConfigReconciliation();
  useGameinfoAutoReset();
  useMissingVpkDetection();
  useHeroDetection();
  useGameBananaCatalogSync();
  usePerfBackgroundSync();
  useIngestToolInit(integrations?.ingestion !== "disabled");
  const { t } = useTranslation();
  const hasReportedStorageFailure = useRef(false);

  const [pendingFontInstalls, setPendingFontInstalls] = useState<
    PendingFontInstall[]
  >([]);
  const activePendingFontInstall = pendingFontInstalls[0] ?? null;

  const {
    showUpdateDialog,
    update,
    isDownloading,
    downloadProgress,
    handleUpdate,
    handleDismiss,
  } = useAutoUpdate(integrations?.updater !== "disabled");

  useEffect(() => {
    if (hasReportedStorageFailure.current) return;
    const recovery = runtime.stateFileRecovery;
    const openFolder = recovery
      ? {
          label: t("persist.openFolder"),
          onClick: () => {
            invoke("show_in_folder", { path: recovery.folder }).catch(
              (error) => {
                logger.withError(error).warn("Failed to open state folder");
              },
            );
          },
        }
      : undefined;

    if (!storage.ok) {
      hasReportedStorageFailure.current = true;
      toast.error(t("persist.loadFailed"), {
        description: t(
          recovery
            ? "persist.lockedDescription"
            : "persist.loadFailedDescription",
          { reason: storage.reason ?? "unknown" },
        ),
        duration: Infinity,
        closeButton: true,
        action: openFolder,
      });
    } else if (recovery?.backupPath) {
      hasReportedStorageFailure.current = true;
      toast.warning(t("persist.resetTitle"), {
        description: t("persist.resetDescription", {
          reason: recovery.reason,
          fileName: recovery.backupPath.split(/[\\/]/).pop(),
        }),
        duration: Infinity,
        closeButton: true,
        action: openFolder,
      });
    }
  }, [runtime, storage, t]);

  const dequeuePendingFontInstall = useCallback(() => {
    setPendingFontInstalls((currentQueue) => currentQueue.slice(1));
  }, []);

  useEffect(() => {
    downloadManager.setFontsFoundHandler((modId, _modName, fonts) => {
      setPendingFontInstalls((currentQueue) => [
        ...currentQueue,
        { modId, fonts },
      ]);
    });
  }, []);

  const handleFontDialogAction = useCallback(
    async (
      command: "install_mod_fonts" | "discard_mod_fonts",
      failureToastKey: string,
      failureLogMessage: string,
    ) => {
      if (!activePendingFontInstall) return;
      const { modId } = activePendingFontInstall;
      try {
        // Discarding only clears the stash in app data, so it is not guarded.
        await (command === "install_mod_fonts"
          ? invokeGuarded(command, { modId })
          : invoke(command, { modId }));
        dequeuePendingFontInstall();
      } catch (error) {
        // The user declined the override: a choice, not a failure. The dialog
        // stays up so they can install once the game is closed.
        if (isGameRunningError(error)) return;
        logger
          .withMetadata({ modId })
          .withError(error)
          .error(failureLogMessage);
        toast.error(t(failureToastKey));
      }
    },
    [activePendingFontInstall, dequeuePendingFontInstall, t],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey='deadlock-theme-v2'>
        <AnalyticsProvider>
          <AppProvider>
            <ProgressProvider>
              <TooltipProvider>
                <AlertDialogProvider>
                  <ModelConflictProvider>
                    <CompatibilityReviewProvider>
                      <LaunchRepairProvider>
                        <TauriAppWindowProvider>
                          <ThemeOverridesProvider>
                            <FoundryProvider>
                              <Layout>
                                <Outlet />
                              </Layout>
                            </FoundryProvider>
                          </ThemeOverridesProvider>
                          <GlobalPluginRenderer />
                          {integrations?.presence !== "disabled" && (
                            <GamePresenceRenderer />
                          )}
                          {integrations?.matchSync !== "disabled" && (
                            <>
                              <MatchSyncRenderer />
                              <MatchSyncNoticeDialog />
                            </>
                          )}
                          <ForgeInstallRenderer />
                          <GameGuardRenderer />
                          <DeepLinkListener />
                          <RemoteInstallPairDialog />
                          <FilePermissionsRenderer />
                          <PerformanceRenderer />
                          <LaunchHealthRenderer />
                          <ModHealthRenderer />
                          <UpdateDialog
                            downloadProgress={downloadProgress}
                            isDownloading={isDownloading}
                            onOpenChange={handleDismiss}
                            onUpdate={handleUpdate}
                            open={showUpdateDialog}
                            update={update}
                          />
                          <OnboardingWizard />
                          <TelemetryConsentDialog />
                          <FontInstallDialog
                            fonts={activePendingFontInstall?.fonts ?? []}
                            isOpen={activePendingFontInstall !== null}
                            onInstall={() =>
                              handleFontDialogAction(
                                "install_mod_fonts",
                                "fontInstall.installFailed",
                                "Failed to install mod fonts",
                              )
                            }
                            onSkip={() =>
                              handleFontDialogAction(
                                "discard_mod_fonts",
                                "fontInstall.discardFailed",
                                "Failed to discard mod fonts",
                              )
                            }
                          />
                        </TauriAppWindowProvider>
                      </LaunchRepairProvider>
                    </CompatibilityReviewProvider>
                  </ModelConflictProvider>
                </AlertDialogProvider>
              </TooltipProvider>
            </ProgressProvider>
          </AppProvider>
        </AnalyticsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
