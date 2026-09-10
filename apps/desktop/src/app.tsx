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
import { FoundryProvider } from "./components/foundry/foundry-context";
import { GamePresenceRenderer } from "./components/game-presence-renderer";
import { LiveMatchRenderer } from "./components/live-match-renderer";
import { MatchSyncRenderer } from "./components/match-sync-renderer";
import GlobalPluginRenderer from "./components/global-plugin-renderer";
import { UpdateDialog } from "./components/layout/update-dialog";
import { TauriAppWindowProvider } from "./components/layout/window-controls/window-context";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard";
import { TelemetryConsentDialog } from "./components/telemetry/telemetry-consent-dialog";
import { AlertDialogProvider } from "./components/providers/alert-dialog";
import { AppProvider } from "./components/providers/app";
import { ThemeProvider } from "./components/providers/theme";
import { ThemeOverridesProvider } from "./components/providers/theme-overrides";
import { AnalyticsProvider } from "./contexts/analytics-context";
import { useAutoUpdate } from "./hooks/use-auto-update";
import { useCrosshairConfigReconciliation } from "./hooks/use-crosshair-config-reconciliation";
import { useDeepLink } from "./hooks/use-deep-link";
import { useIngestToolInit } from "./hooks/use-ingest-tool-init";
import { useLanguageListener } from "./hooks/use-language-listener";
import { useDownloadsMigration } from "./hooks/use-downloads-migration";
import { useHeroDetection } from "./hooks/use-hero-detection";
import { useGameBananaCatalogSync } from "./hooks/use-gamebanana-catalog-sync";
import { useModOrderMigration } from "./hooks/use-mod-order-migration";
import { Layout } from "./layout";
import { queryClient } from "./lib/client";
import { downloadManager } from "./lib/download/manager";
import logger from "./lib/logger";
import type { RuntimeBootstrap } from "./lib/runtime-bootstrap";
import type { StorageReadyStatus } from "./lib/store/storage";
import type { FontInfo } from "./types/mods";

interface PendingFontInstall {
  modId: string;
  fonts: FontInfo[];
}

type AppProps = {
  runtime: RuntimeBootstrap;
  storage: StorageReadyStatus;
};

const App = ({ runtime, storage }: AppProps) => {
  const integrations = runtime.integrations;
  useDeepLink();
  useLanguageListener();
  useModOrderMigration();
  useDownloadsMigration();
  useCrosshairConfigReconciliation();
  useHeroDetection();
  useGameBananaCatalogSync();
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
    if (!storage.ok && !hasReportedStorageFailure.current) {
      hasReportedStorageFailure.current = true;
      toast.error(t("persist.loadFailed"), {
        description: t("persist.loadFailedDescription", {
          reason: storage.reason ?? "unknown",
        }),
      });
    }
  }, [storage, t]);

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
        await invoke(command, { modId });
        dequeuePendingFontInstall();
      } catch (error) {
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
                        <LiveMatchRenderer />
                      </>
                    )}
                    <ForgeInstallRenderer />
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
