import type { Window } from "@tauri-apps/api/window";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type React from "react";
import { createContext, useCallback, useEffect, useState } from "react";
import { getOsType } from "@/lib/utils";

interface TauriAppWindowContextType {
  appWindow: Window | null;
  isWindowMaximized: boolean;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  fullscreenWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
}

const TauriAppWindowContext = createContext<TauriAppWindowContextType>({
  appWindow: null,
  isWindowMaximized: false,
  minimizeWindow: () => Promise.resolve(),
  maximizeWindow: () => Promise.resolve(),
  fullscreenWindow: () => Promise.resolve(),
  closeWindow: () => Promise.resolve(),
});

interface TauriAppWindowProviderProps {
  children: React.ReactNode;
}

export const TauriAppWindowProvider: React.FC<TauriAppWindowProviderProps> = ({
  children,
}) => {
  const [appWindow, setAppWindow] = useState<Window | null>(null);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppWindow(getCurrentWindow());
    }
  }, []);

  const updateIsWindowMaximized = useCallback(async () => {
    if (appWindow) {
      const _isWindowMaximized = await appWindow.isMaximized();
      setIsWindowMaximized(_isWindowMaximized);
    }
  }, [appWindow]);

  useEffect(() => {
    getOsType().then((osname) => {
      if (osname !== "darwin") {
        updateIsWindowMaximized();

        let unlisten: () => void = () => {};

        const listen = async () => {
          if (appWindow) {
            unlisten = await appWindow.onResized(() => {
              updateIsWindowMaximized();
            });
          }
        };

        listen();

        return () => unlisten?.();
      }
    });
  }, [appWindow, updateIsWindowMaximized]);

  const minimizeWindow = async () => {
    if (appWindow) {
      await appWindow.minimize();
    }
  };

  const maximizeWindow = async () => {
    if (appWindow) {
      await appWindow.toggleMaximize();
    }
  };

  const fullscreenWindow = async () => {
    if (appWindow) {
      const fullscreen = await appWindow.isFullscreen();
      if (fullscreen) {
        await appWindow.setFullscreen(false);
      } else {
        await appWindow.setFullscreen(true);
      }
    }
  };

  const closeWindow = async () => {
    if (appWindow) {
      await appWindow.close();
    }
  };

  return (
    <TauriAppWindowContext.Provider
      value={{
        appWindow,
        isWindowMaximized,
        minimizeWindow,
        maximizeWindow,
        fullscreenWindow,
        closeWindow,
      }}>
      {children}
    </TauriAppWindowContext.Provider>
  );
};

export default TauriAppWindowContext;
