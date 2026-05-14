import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useEffect, useMemo } from "react";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

type AppProviderProps = {
  children: React.ReactNode;
};

type AppProviderState = {
  _placeholder?: unknown; // Just a placeholder
};

const AppProviderContext = createContext<AppProviderState>({});

export const AppProvider = ({ children, ...props }: AppProviderProps) => {
  const clearLastJoin = usePersistedStore((s) => s.clearLastJoin);

  useEffect(() => {
    const waitForHydration = async () => {
      const persist = usePersistedStore.persist;
      if (!persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const unsubscribe = persist.onFinishHydration(() => {
            unsubscribe();
            resolve();
          });
        });
      }
    };

    const cleanupStaleServerGameinfo = async () => {
      await waitForHydration();

      const activeProfile = usePersistedStore.getState().getActiveProfile();
      const reverted = await invoke<boolean>("cleanup_stale_server_gameinfo", {
        activeProfileFolder: activeProfile?.folderName ?? null,
      });
      if (reverted) {
        clearLastJoin();
        logger.info("Reverted stale server gameinfo on app bootstrap");
      }
    };

    const resolveGamePath = async () => {
      await waitForHydration();

      const currentGamePath = usePersistedStore.getState().gamePath;
      if (currentGamePath) {
        try {
          await invoke<string>("set_game_path", { path: currentGamePath });
          return;
        } catch {
          usePersistedStore.getState().setGamePath("");
        }
      }
      const found = await invoke<string>("find_game_path");
      usePersistedStore.getState().setGamePath(found);
    };

    resolveGamePath()
      .then(cleanupStaleServerGameinfo)
      .then(() => usePersistedStore.getState().restoreModsFromManifest())
      .catch((error) => {
        logger.withError(error).debug("App bootstrap initialization skipped");
      });
  }, []);

  const contextValue = useMemo<AppProviderState>(() => ({}), []);

  return (
    <AppProviderContext.Provider {...props} value={contextValue}>
      {children}
    </AppProviderContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppProviderContext);
  if (context === undefined) {
    throw new Error("useApp must be used within a AppProvider");
  }
  return context;
};
