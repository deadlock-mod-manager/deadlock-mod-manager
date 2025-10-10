import { Dialog } from "@deadlock-mods/ui/components/dialog";
import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@deadlock-mods/ui/components/menubar";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { open } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { WindowTitlebar } from "tauri-controls";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import useUpdateManager from "@/hooks/use-update-manager";
import { GITHUB_REPO } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { AboutDialog } from "./about-dialog";
import Logo from "./logo";

const logger = createLogger("titlebar");

interface MenuItem {
  label: string;
  action?: () => void | Promise<void>;
  shortcut?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export const Titlebar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { checkForUpdates, updateAndRelaunch } = useUpdateManager();
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [currentWindow, setCurrentWindow] = useState<ReturnType<
    typeof getCurrentWindow
  > | null>(null);

  useEffect(() => {
    setCurrentWindow(getCurrentWindow());
  }, []);

  const handleOpenModsFolder = async () => {
    try {
      await invoke("open_mods_folder");
    } catch (error) {
      logger.error("Failed to open mods folder", { error });
      toast.error(t("common.failedToOpenFolder"));
    }
  };

  const handleOpenGameFolder = async () => {
    try {
      await invoke("open_game_folder");
    } catch (error) {
      logger.error("Failed to open game folder", { error });
      toast.error(t("common.failedToOpenFolder"));
    }
  };

  const handleSettings = () => {
    navigate("/settings");
  };

  const handleCheckForUpdates = async () => {
    try {
      const update = await checkForUpdates();
      if (update) {
        toast.loading(t("about.downloadingUpdate"));
        await updateAndRelaunch();
      } else {
        toast.info(t("about.latestVersion"));
      }
    } catch (error) {
      logger.error("Failed to check for updates", { error });
      toast.error(t("about.updateFailed"));
    }
  };

  const handleExit = async () => {
    try {
      await exit(0);
    } catch (error) {
      logger.error("Failed to exit", { error });
    }
  };

  const handleReload = async () => {
    try {
      if (currentWindow) {
        await currentWindow.emit("tauri://reload");
      }
      window.location.reload();
    } catch (error) {
      logger.error("Failed to reload", { error });
    }
  };

  const handleToggleFullscreen = async () => {
    try {
      if (currentWindow) {
        const isFullscreen = await currentWindow.isFullscreen();
        await currentWindow.setFullscreen(!isFullscreen);
      }
    } catch (error) {
      logger.error("Failed to toggle fullscreen", { error });
    }
  };

  const handleZoomIn = () => {
    const currentZoom = Number.parseFloat(
      getComputedStyle(document.documentElement).zoom || "1",
    );
    const newZoom = Math.min(currentZoom + 0.1, 2.0);
    document.documentElement.style.zoom = `${newZoom}`;
  };

  const handleZoomOut = () => {
    const currentZoom = Number.parseFloat(
      getComputedStyle(document.documentElement).zoom || "1",
    );
    const newZoom = Math.max(currentZoom - 0.1, 0.5);
    document.documentElement.style.zoom = `${newZoom}`;
  };

  const handleResetZoom = () => {
    document.documentElement.style.zoom = "1";
  };

  const handleDocumentation = () => {
    open("https://docs.deadlockmods.app/");
  };

  const handleAskForHelp = () => {
    open("https://deadlockmods.app/discord");
  };

  const handleReportIssue = () => {
    open(`${GITHUB_REPO}/issues/new/choose`);
  };

  const handleAbout = () => {
    setShowAboutDialog(true);
  };

  // Register global shortcuts
  useGlobalShortcuts([
    {
      key: "Ctrl+M",
      handler: handleOpenModsFolder,
      description: "Open Mods Folder",
    },
    {
      key: "Ctrl+Shift+G",
      handler: handleOpenGameFolder,
      description: "Open Game Folder",
    },
    {
      key: "Ctrl+Shift+M",
      handler: async () => {
        try {
          await invoke("open_mods_store");
        } catch (error) {
          logger.error("Failed to open mods store", { error });
          toast.error(t("common.failedToOpenFolder"));
        }
      },
      description: "Open Mods Store",
    },
    {
      key: "Ctrl+,",
      handler: handleSettings,
      description: "Open Settings",
    },
    {
      key: "Ctrl+R",
      handler: handleReload,
      description: "Reload Application",
    },
    {
      key: "F11",
      handler: handleToggleFullscreen,
      description: "Toggle Fullscreen",
    },
    {
      key: "Ctrl++",
      handler: handleZoomIn,
      description: "Zoom In",
    },
    {
      key: "Ctrl+-",
      handler: handleZoomOut,
      description: "Zoom Out",
    },
    {
      key: "Ctrl+0",
      handler: handleResetZoom,
      description: "Reset Zoom",
    },
    {
      key: "Alt+F4",
      handler: handleExit,
      description: "Exit Application",
    },
  ]);

  const menuItems: MenuGroup[] = [
    {
      label: "File",
      items: [
        {
          label: "Open Mods Folder",
          action: handleOpenModsFolder,
          shortcut: "Ctrl+M",
        },
        {
          label: "Open Game Folder",
          action: handleOpenGameFolder,
          shortcut: "Ctrl+Shift+G",
        },
        {
          label: "Open Mods Store",
          action: async () => {
            try {
              await invoke("open_mods_store");
            } catch (error) {
              logger.error("Failed to open mods store", { error });
              toast.error(t("common.failedToOpenFolder"));
            }
          },
          shortcut: "Ctrl+Shift+M",
        },
        { separator: true, label: "" },
        {
          label: "Settings",
          action: handleSettings,
          shortcut: "Ctrl+,",
        },
        { separator: true, label: "" },
        {
          label: "Check for Updates",
          action: handleCheckForUpdates,
        },
        {
          label: "Exit",
          action: handleExit,
          shortcut: "Alt+F4",
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Reload",
          action: handleReload,
          shortcut: "Ctrl+R",
        },
        {
          label: "Toggle Fullscreen",
          action: handleToggleFullscreen,
          shortcut: "F11",
        },
        { separator: true, label: "" },
        {
          label: "Zoom In",
          action: handleZoomIn,
          shortcut: "Ctrl++",
        },
        {
          label: "Zoom Out",
          action: handleZoomOut,
          shortcut: "Ctrl+-",
        },
        {
          label: "Reset Zoom",
          action: handleResetZoom,
          shortcut: "Ctrl+0",
        },
      ],
    },
    {
      label: "Help",
      items: [
        {
          label: "Open Documentation",
          action: handleDocumentation,
        },
        {
          label: "Ask for help",
          action: handleAskForHelp,
        },
        {
          label: "Report issue or bug",
          action: handleReportIssue,
        },
        { separator: true, label: "" },
        {
          label: "About",
          action: handleAbout,
        },
      ],
    },
  ];

  return (
    <>
      <WindowTitlebar className='z-20 bg-background'>
        <div className='inline-flex h-fit w-fit items-center gap-2 px-2 py-1'>
          <Logo className='size-5' />
          <Menubar className='border-none bg-transparent shadow-none h-auto p-0'>
            {menuItems.map((menu) => (
              <MenubarMenu key={menu.label}>
                <MenubarTrigger className='text-xs px-2 py-1 h-auto'>
                  {menu.label}
                </MenubarTrigger>
                <MenubarContent>
                  {menu.items.map((item, index) => {
                    if (item.separator) {
                      return (
                        <MenubarSeparator
                          key={`${menu.label}-separator-${index}`}
                        />
                      );
                    }

                    return (
                      <MenubarItem
                        disabled={item.disabled}
                        key={item.label}
                        onClick={item.action}>
                        {item.label}
                        {item.shortcut && (
                          <div className='ml-auto'>
                            <Kbd>{item.shortcut}</Kbd>
                          </div>
                        )}
                      </MenubarItem>
                    );
                  })}
                </MenubarContent>
              </MenubarMenu>
            ))}
          </Menubar>
        </div>
      </WindowTitlebar>

      <Dialog onOpenChange={setShowAboutDialog} open={showAboutDialog}>
        <AboutDialog />
      </Dialog>
    </>
  );
};
