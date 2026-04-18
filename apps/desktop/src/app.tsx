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
import { useModOrderMigration } from "./hooks/use-mod-order-migration";
import { Layout } from "./layout";
import { initializeApiUrl } from "./lib/api";
import { queryClient } from "./lib/client";
import { STORE_NAME } from "./lib/constants";
import { downloadManager } from "./lib/download/manager";
import logger from "./lib/logger";
import { usePersistedStore } from "./lib/store";
import type { FontInfo } from "./types/mods";

interface PendingFontInstall {
  modId: string;
  fonts: FontInfo[];
}

const App = () => {
  useDeepLink();
  useLanguageListener();
  useModOrderMigration();
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
    await usePersistedStore.persist.rehydrate();
    await initializeApiUrl();
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
                      onInstall={async () => {
                        if (!activePendingFontInstall) return;
                        try {
                          await invoke("install_mod_fonts", {
                            modId: activePendingFontInstall.modId,
                          });
                          dequeuePendingFontInstall();
                        } catch (error) {
                          logger
                            .withMetadata({
                              modId: activePendingFontInstall.modId,
                            })
                            .withError(
                              error instanceof Error
                                ? error
                                : new Error(String(error)),
                            )
                            .error("Failed to install mod fonts");
                          toast.error(t("fontInstall.installFailed"));
                        }
                      }}
                      onSkip={async () => {
                        if (!activePendingFontInstall) return;
                        try {
                          await invoke("discard_mod_fonts", {
                            modId: activePendingFontInstall.modId,
                          });
                          dequeuePendingFontInstall();
                        } catch (error) {
                          logger
                            .withMetadata({
                              modId: activePendingFontInstall.modId,
                            })
                            .withError(
                              error instanceof Error
                                ? error
                                : new Error(String(error)),
                            )
                            .error("Failed to discard mod fonts");
                          toast.error(t("fontInstall.discardFailed"));
                        }
                      }}
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
