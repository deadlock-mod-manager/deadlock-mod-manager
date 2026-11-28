import { toast } from "@deadlock-mods/ui/components/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { type InvokeArgs, invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { KeybindHandlers } from "@/hooks/use-keybinds";
import { useLaunch } from "@/hooks/use-launch";
import { useLaunchProgress } from "@/lib/launch-progress";
import { createLogger } from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { flushPendingWrites } from "@/lib/store/storage";

const logger = createLogger("app-commands");

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

// Tauri can set the webview zoom but not read it, so track the last level the
// webview accepted. Requests run one at a time, each from that level.
let zoomLevel = 1;
let zoomQueue = Promise.resolve();

const changeZoom = (target: (current: number) => number) => {
  zoomQueue = zoomQueue.then(async () => {
    const next =
      Math.round(
        Math.min(Math.max(target(zoomLevel), MIN_ZOOM), MAX_ZOOM) * 10,
      ) / 10;
    if (next === zoomLevel) return;
    try {
      await getCurrentWebview().setZoom(next);
      zoomLevel = next;
    } catch (error) {
      logger.withError(error).error("Failed to set zoom");
    }
  });
  return zoomQueue;
};

// Each toggle reads the window state, so overlapping toggles would read the
// same state and cancel out instead of alternating.
let windowQueue = Promise.resolve();
const queueWindowChange = (change: () => Promise<void>) => {
  windowQueue = windowQueue.then(change);
  return windowQueue;
};

const toggleFullscreen = async () => {
  try {
    const appWindow = getCurrentWindow();
    await appWindow.setFullscreen(!(await appWindow.isFullscreen()));
  } catch (error) {
    logger.withError(error).error("Failed to toggle fullscreen");
  }
};

const toggleMaximize = async () => {
  try {
    const appWindow = getCurrentWindow();
    // Leaving fullscreen already gives the taskbar back; toggling as well
    // would also restore a window that was maximized before.
    if (await appWindow.isFullscreen()) {
      await appWindow.setFullscreen(false);
      return;
    }
    await appWindow.toggleMaximize();
  } catch (error) {
    logger.withError(error).error("Failed to toggle maximize");
  }
};

const reload = async () => {
  try {
    await getCurrentWindow().emit("tauri://reload");
    globalThis.location.reload();
  } catch (error) {
    logger.withError(error).error("Failed to reload");
  }
};

// Goes through the close request like the title bar's X, so close to tray applies.
const closeWindow = async () => {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    logger.withError(error).error("Failed to close window");
  }
};

const quit = async () => {
  try {
    await flushPendingWrites();
    await exit(0);
  } catch (error) {
    logger.withError(error).error("Failed to exit");
  }
};

/** Every app command that a keybind or the menu bar can trigger. */
export const useAppCommands = ({
  onOpenKeybinds,
}: {
  onOpenKeybinds: () => void;
}): KeybindHandlers => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { launch } = useLaunch();
  const gamePath = usePersistedStore((s) => s.gamePath);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const markFeatureUsed = usePersistedStore((s) => s.markFeatureUsed);
  const launchPending = useRef(false);

  const openFolder = async (command: string, args?: InvokeArgs) => {
    try {
      await invoke(command, args);
    } catch (error) {
      logger
        .withError(error)
        .withMetadata({ command })
        .error("Failed to open folder");
      toast.error(t("common.failedToOpenFolder"));
    }
  };

  const launchGame = async (vanilla: boolean) => {
    const isLaunching =
      launchPending.current || useLaunchProgress.getState().progress !== null;
    const isRunning =
      queryClient.getQueryData<boolean>(["is-game-running"]) === true;
    if (!gamePath || isLaunching || isRunning) return;
    // Launch progress appears only after the first await in `launch`.
    launchPending.current = true;
    try {
      await launch(vanilla);
    } finally {
      launchPending.current = false;
    }
  };

  return {
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    openDashboard: () => navigate("/"),
    openMyMods: () => navigate("/my-mods"),
    openBrowseMods: () => navigate("/mods"),
    openDownloads: () => navigate("/downloads"),
    openSettings: () => navigate("/settings"),
    openKeybinds: onOpenKeybinds,
    launchModded: () => launchGame(false),
    launchVanilla: () => launchGame(true),
    openModsFolder: () => {
      markFeatureUsed("mods-folder-shortcut");
      return openFolder("open_mods_folder", {
        profileFolder: getActiveProfile()?.folderName ?? null,
      });
    },
    openGameFolder: () => openFolder("open_game_folder"),
    openModsDataFolder: () => openFolder("open_mods_data_folder"),
    toggleMaximize: () => queueWindowChange(toggleMaximize),
    toggleFullscreen: () => queueWindowChange(toggleFullscreen),
    reload,
    zoomIn: () => changeZoom((zoom) => zoom + ZOOM_STEP),
    zoomOut: () => changeZoom((zoom) => zoom - ZOOM_STEP),
    resetZoom: () => changeZoom(() => 1),
    closeWindow,
    quit,
  };
};
