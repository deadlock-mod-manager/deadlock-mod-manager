import { TooltipProvider } from "@deadlock-mods/ui/components/tooltip";
import { load } from "@tauri-apps/plugin-store";
import usePromise from "react-promise-suspense";
import { QueryClientProvider } from "react-query";
import { Outlet } from "react-router";
import { ProgressProvider } from "./components/downloads/progress-indicator";
import { UpdateDialog } from "./components/layout/update-dialog";
import { AlertDialogProvider } from "./components/providers/alert-dialog";
import { AppProvider } from "./components/providers/app";
import { ThemeProvider } from "./components/providers/theme";
import { AnalyticsProvider } from "./contexts/analytics-context";
import { useAutoUpdate } from "./hooks/use-auto-update";
import { useDeepLink } from "./hooks/use-deep-link";
import { useLanguageListener } from "./hooks/use-language-listener";
import { useModOrderMigration } from "./hooks/use-mod-order-migration";
import { Layout } from "./layout";
import { initializeApiUrl } from "./lib/api";
import { queryClient } from "./lib/client";
import { STORE_NAME } from "./lib/constants";
import logger from "./lib/logger";
import { usePersistedStore } from "./lib/store";

const App = () => {
  useDeepLink();
  useLanguageListener();
  useModOrderMigration();

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

    logger.debug("Store rehydrated and API URL initialized");
  };

  usePromise(hydrateStore, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey='deadlock-theme-v2'>
        <AnalyticsProvider>
          <AppProvider>
            <ProgressProvider>
              <TooltipProvider>
                <AlertDialogProvider>
                  <Layout>
                    <Outlet />
                  </Layout>
                  <UpdateDialog
                    downloadProgress={downloadProgress}
                    isDownloading={isDownloading}
                    onOpenChange={handleDismiss}
                    onUpdate={handleUpdate}
                    open={showUpdateDialog}
                    update={update}
                  />
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
