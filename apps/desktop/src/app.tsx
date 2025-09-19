import { load } from "@tauri-apps/plugin-store";
import usePromise from "react-promise-suspense";
import { QueryClientProvider } from "react-query";
import { Outlet } from "react-router";
import { ProgressProvider } from "./components/downloads/progress-indicator";
import { AlertDialogProvider } from "./components/providers/alert-dialog";
import { AppProvider } from "./components/providers/app";
import { ThemeProvider } from "./components/providers/theme";
import { TooltipProvider } from "./components/ui/tooltip";
import { useDeepLink } from "./hooks/use-deep-link";
import { useLanguageListener } from "./hooks/use-language-listener";
import { Layout } from "./layout";
import { queryClient } from "./lib/client";
import { STORE_NAME } from "./lib/constants";
import logger from "./lib/logger";
import { usePersistedStore } from "./lib/store";

const App = () => {
  // Initialize deep link listener
  useDeepLink();

  // Initialize language listener
  useLanguageListener();

  const hydrateStore = async () => {
    await load(STORE_NAME, { autoSave: true, defaults: {} });
    await usePersistedStore.persist.rehydrate();

    logger.debug("Store rehydrated");
  };

  usePromise(hydrateStore, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider storageKey='deadlock-theme-v2'>
        <AppProvider>
          <ProgressProvider>
            <TooltipProvider>
              <AlertDialogProvider>
                <Layout>
                  <Outlet />
                </Layout>
              </AlertDialogProvider>
            </TooltipProvider>
          </ProgressProvider>
        </AppProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
