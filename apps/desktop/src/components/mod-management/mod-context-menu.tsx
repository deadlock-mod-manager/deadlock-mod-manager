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
import type { LocalMod } from "@/types/mods";

interface ModContextMenuProps {
  mod: LocalMod;
  children: React.ReactNode;
}

export const ModContextMenu = ({ mod, children }: ModContextMenuProps) => {
  const { t } = useTranslation();

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
      if (mod.installedVpks && mod.installedVpks.length > 0) {
        await invoke("show_mod_in_game", { vpkFiles: mod.installedVpks });
        toast.success(t("contextMenu.openedModInGame"));
      } else {
        await invoke("open_game_folder");
        toast.success(t("contextMenu.openedGameFolder"));
      }
    } catch (error) {
      toast.error(t("contextMenu.failedToOpenGameFolder"));
    }
  };

  const handleOpenModStore = async () => {
    try {
      // Try to use the mod's path if available, otherwise try the ID
      if (mod.path) {
        await invoke("show_in_folder", { path: mod.path });
        toast.success(t("contextMenu.openedModInStore"));
      } else if (mod.id) {
        await invoke("show_mod_in_store", { modId: mod.remoteId });
        toast.success(t("contextMenu.openedModInStore"));
      } else {
        // Fallback to general mod store
        await invoke("open_mods_store");
        toast.success(t("contextMenu.openedModStore"));
      }
    } catch (error) {
      // If specific mod folder fails, fallback to general mod store
      try {
        await invoke("open_mods_store");
        toast.success(t("contextMenu.openedModStore"));
      } catch (fallbackError) {
        toast.error(t("contextMenu.failedToOpenModStore"));
      }
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
        <ContextMenuItem onClick={handleOpenModStore}>
          <FolderOpen className='mr-2 h-4 w-4' />
          {t("contextMenu.openModStore")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
