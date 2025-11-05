import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@deadlock-mods/ui/components/context-menu";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FolderOpen } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { FaShare } from "react-icons/fa";
import { usePersistedStore } from "@/lib/store";
import type { LocalMod } from "@/types/mods";

interface ModContextMenuProps {
  mod: LocalMod;
  children: React.ReactNode;
}

export const ModContextMenu = ({ mod, children }: ModContextMenuProps) => {
  const { t } = useTranslation();
  const { getActiveProfile } = usePersistedStore();

  const handleShareMod = async () => {
    if (mod.remoteUrl) {
      try {
        await navigator.clipboard.writeText(mod.remoteUrl);
        toast.success(t("contextMenu.urlCopied"));
      } catch (error) {
        toast.error(t("contextMenu.failedToCopyUrl"));
      }
    } else {
      toast.error(t("contextMenu.noUrlAvailable"));
    }
  };

  const handleOpenInGame = async () => {
    try {
      const activeProfile = getActiveProfile();
      const profileFolder = activeProfile?.folderName ?? null;

      if (mod.installedVpks && mod.installedVpks.length > 0) {
        await invoke("show_mod_in_game", {
          vpkFiles: mod.installedVpks,
          profileFolder,
        });
        toast.success(t("contextMenu.openedModInGame"));
      } else {
        await invoke("open_game_folder");
        toast.success(t("contextMenu.openedGameFolder"));
      }
    } catch (error) {
      toast.error(t("contextMenu.failedToOpenGameFolder"));
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className='w-60'>
        {mod.remoteUrl && (
          <ContextMenuItem onClick={handleShareMod}>
            <FaShare className='mr-2 h-4 w-4' />
            {t("contextMenu.shareUrl")}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleOpenInGame}>
          <FolderOpen className='mr-2 h-4 w-4' />
          {t("contextMenu.openInGame")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
