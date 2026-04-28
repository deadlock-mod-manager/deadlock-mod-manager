import { toast } from "@deadlock-mods/ui/components/sonner";
import { TooltipProvider } from "@deadlock-mods/ui/components/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import usePromise from "react-promise-suspense";
import { Outlet } from "react-router";
import { FontInstallDialog } from "./components/downloads/font-install-dialog";
import { ProgressProvider } from "./components/downloads/progress-indicator";
import GlobalPluginRenderer from "./components/global-plugin-renderer";
import { UpdateDialog } from "./components/layout/update-dialog";
import { TauriAppWindowProvider } from "./components/layout/window-controls/window-context";
import { OnboardingWizard } from "./components/onboarding/onboarding-wizard";
import { AlertDialogProvider } from "./components/providers/alert-dialog";
import { AppProvider } from "./components/providers/app";
import { ThemeProvider } from "./components/providers/theme";
import { ThemeOverridesProvider } from "./components/providers/theme-overrides";
import { AnalyticsProvider } from "./contexts/analytics-context";
import { useAutoUpdate } from "./hooks/use-auto-update";
import { useDeepLink } from "./hooks/use-deep-link";
import { useIngestToolInit } from "./hooks/use-ingest-tool-init";
import { useLanguageListener } from "./hooks/use-language-listener";
import { useHeroDetection } from "./hooks/use-hero-detection";
import { useModCompression } from "./hooks/use-mod-compression";
import { useModOrderMigration } from "./hooks/use-mod-order-migration";
import { Layout } from "./layout";
import { initializeApiUrl } from "./lib/api";
import { queryClient } from "./lib/client";
import { STORE_NAME } from "./lib/constants";
import { downloadManager } from "./lib/download/manager";
import logger from "./lib/logger";
import { syncProxyConfigToBackend } from "./lib/proxy";
import { usePersistedStore } from "./lib/store";
import { markStorageReady, storageReady } from "./lib/store/storage";
import type { FontInfo } from "./types/mods";

interface PendingFontInstall {
  modId: string;
  fonts: FontInfo[];
}

const App = () => {
  useDeepLink();
  useLanguageListener();
  useModOrderMigration();
  useHeroDetection();
  useModCompression();
  useIngestToolInit();
  const { t } = useTranslation();

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
  } = useAutoUpdate();

  const hydrateStore = async () => {
    await load(STORE_NAME, { autoSave: true, defaults: {} });
    try {
      await usePersistedStore.persist.rehydrate();
    } finally {
      markStorageReady();
    }
    const status = await storageReady();
    if (!status.ok) {
      toast.error(t("persist.loadFailed"), {
        description: t("persist.loadFailedDescription", {
          reason: status.reason ?? "unknown",
        }),
      });
    }
    await initializeApiUrl();
    await syncProxyConfigToBackend();
    await downloadManager.init();

    logger.debug(
      "Store rehydrated, API URL initialized, and download manager ready",
    );
  };

  usePromise(hydrateStore, []);

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
                      <Layout>
                        <Outlet />
                      </Layout>
                    </ThemeOverridesProvider>
                    <GlobalPluginRenderer />
                    <UpdateDialog
                      downloadProgress={downloadProgress}
                      isDownloading={isDownloading}
                      onOpenChange={handleDismiss}
                      onUpdate={handleUpdate}
                      open={showUpdateDialog}
                      update={update}
                    />
                    <OnboardingWizard />
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
