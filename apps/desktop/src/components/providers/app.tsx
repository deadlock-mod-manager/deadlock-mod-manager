import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useEffect } from "react";
import { usePersistedStore } from "@/lib/store";

type AppProviderProps = {
  children: React.ReactNode;
};

type AppProviderState = {
  _placeholder?: unknown; // Just a placeholder
};

const AppProviderContext = createContext<AppProviderState>({});

export const AppProvider = ({ children, ...props }: AppProviderProps) => {
  const { gamePath, setGamePath } = usePersistedStore();

  useEffect(() => {
    if (!gamePath) {
      invoke("find_game_path").then((path) => setGamePath(path as string));
    }
  }, [gamePath, setGamePath]);

  return (
    <AppProviderContext.Provider {...props} value={{}}>
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
