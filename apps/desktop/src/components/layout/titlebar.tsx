import { Dialog } from "@deadlock-mods/ui/components/dialog";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@deadlock-mods/ui/components/menubar";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeybindsDialog } from "@/components/settings/keybinds/keybinds-dialog";
import { KeyCombo } from "@/components/shared/key-combo";
import { useAppCommands } from "@/hooks/use-app-commands";
import { useKeybinds, useResolvedKeybinds } from "@/hooks/use-keybinds";
import useUpdateManager from "@/hooks/use-update-manager";
import { showAppUpdateError } from "@/lib/app-update-notifications";
import { GITHUB_REPO } from "@/lib/constants";
import type { KeybindAction } from "@/lib/keybinds";
import { AboutDialog } from "./about-dialog";
import { Toolbar } from "./toolbar";
import { WindowTitlebar } from "./window-controls/window-titlebar";

type MenuItem =
  | { separator: true; id: string }
  | {
      separator?: false;
      label: string;
      action: () => void | Promise<void>;
      keybind?: KeybindAction;
    };

type MenuGroup = {
  label: string;
  items: MenuItem[];
};

export const Titlebar = () => {
  const { t } = useTranslation();
  const { checkForUpdates, updateAndRelaunch } = useUpdateManager();
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showKeybinds, setShowKeybinds] = useState(false);
  const commands = useAppCommands({
    onOpenKeybinds: () => setShowKeybinds(true),
  });
  const keybinds = useResolvedKeybinds();
  const [showMenubar, setShowMenubar] = useState(false);

  useKeybinds(commands);

  // Tapping Alt on its own toggles the menu bar, as in other Windows apps.
  // Alt held for a shortcut such as Alt+F4 leaves it alone.
  useEffect(() => {
    let altTapped = false;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        event.preventDefault();
        if (!event.repeat) altTapped = true;
        return;
      }
      altTapped = false;
      if (event.key === "Escape") setShowMenubar(false);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt" && altTapped) {
        event.preventDefault();
        setShowMenubar((visible) => !visible);
      }
      altTapped = false;
    };
    const handleBlur = () => {
      altTapped = false;
      setShowMenubar(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!showMenubar) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-menubar="true"], [role="menu"]')
      ) {
        return;
      }
      setShowMenubar(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [showMenubar]);

  const handleCheckForUpdates = async () => {
    try {
      const update = await checkForUpdates();
      if (update) {
        toast.info(t("update.available"), {
          action: {
            label: t("about.installUpdate"),
            onClick: () => {
              void updateAndRelaunch(update).catch((error) => {
                showAppUpdateError(error instanceof Error ? error : null);
              });
            },
          },
        });
      } else {
        toast.info(t("about.latestVersion"));
      }
    } catch (error) {
      showAppUpdateError(error instanceof Error ? error : null);
    }
  };

  const commandItem = (keybind: KeybindAction): MenuItem => ({
    label: t(`keybinds.actions.${keybind}`),
    action: commands[keybind],
    keybind,
  });

  const menuItems: MenuGroup[] = [
    {
      label: t("menuBar.file"),
      items: [
        commandItem("openModsFolder"),
        commandItem("openGameFolder"),
        commandItem("openModsDataFolder"),
        { separator: true, id: "file-settings" },
        commandItem("openSettings"),
        commandItem("openKeybinds"),
        { separator: true, id: "file-exit" },
        {
          label: t("menuBar.checkForUpdates"),
          action: handleCheckForUpdates,
        },
        commandItem("closeWindow"),
        commandItem("quit"),
      ],
    },
    {
      label: t("menuBar.view"),
      items: [
        commandItem("reload"),
        commandItem("toggleMaximize"),
        commandItem("toggleFullscreen"),
        { separator: true, id: "view-zoom" },
        commandItem("zoomIn"),
        commandItem("zoomOut"),
        commandItem("resetZoom"),
      ],
    },
    {
      label: t("menuBar.help"),
      items: [
        {
          label: t("menuBar.documentation"),
          action: () => openUrl("https://docs.deadlockmods.app/"),
        },
        {
          label: t("menuBar.askForHelp"),
          action: () => openUrl("https://deadlockmods.app/discord"),
        },
        {
          label: t("menuBar.reportIssue"),
          action: () => openUrl(`${GITHUB_REPO}/issues/new/choose`),
        },
        { separator: true, id: "help-about" },
        {
          label: t("menuBar.about"),
          action: () => setShowAboutDialog(true),
        },
      ],
    },
  ];

  return (
    <>
      <WindowTitlebar
        className='z-20 h-auto border-b bg-background'
        data-titlebar='true'>
        <Toolbar />
      </WindowTitlebar>

      {showMenubar && (
        <div
          className='z-20 flex h-8 w-full shrink-0 items-center border-b bg-background px-2'
          data-menubar='true'
          data-tauri-drag-region
          data-titlebar='true'>
          <Menubar className='h-auto border-none bg-transparent p-0 shadow-none'>
            {menuItems.map((menu) => (
              <MenubarMenu key={menu.label}>
                <MenubarTrigger className='h-auto px-2 py-1 text-xs'>
                  {menu.label}
                </MenubarTrigger>
                <MenubarContent>
                  {menu.items.map((item) => {
                    if (item.separator) {
                      return <MenubarSeparator key={item.id} />;
                    }
                    const combo = item.keybind && keybinds.get(item.keybind);

                    return (
                      <MenubarItem
                        key={item.label}
                        onClick={() => {
                          setShowMenubar(false);
                          void item.action();
                        }}>
                        {item.label}
                        {combo && (
                          <KeyCombo className='ml-auto pl-4' combo={combo} />
                        )}
                      </MenubarItem>
                    );
                  })}
                </MenubarContent>
              </MenubarMenu>
            ))}
          </Menubar>
        </div>
      )}

      <Dialog onOpenChange={setShowAboutDialog} open={showAboutDialog}>
        <AboutDialog />
      </Dialog>

      <KeybindsDialog onOpenChange={setShowKeybinds} open={showKeybinds} />
    </>
  );
};
