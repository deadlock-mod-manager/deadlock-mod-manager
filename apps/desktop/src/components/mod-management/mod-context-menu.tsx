import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@deadlock-mods/ui/components/context-menu";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FolderOpen, SquareCheck } from "@deadlock-mods/ui/icons";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FaShare } from "react-icons/fa";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { ModHealthMenuItems } from "@/components/mod-health/mod-health-menu-items";
import { useReinstallAction } from "@/hooks/use-reinstall-action";
import { usePersistedStore } from "@/lib/store";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import { useMoveModsToGroup } from "@/hooks/use-move-mods-to-group";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

interface ModContextMenuProps {
  mod: LocalMod;
  /** Points the right-click feature hint at this card. */
  hint?: boolean;
  /** Toggles this mod in library multi-select, starting it if needed. */
  onSelect?: () => void;
  /** Whether this mod is already selected, so the item offers to deselect. */
  selected?: boolean;
  children: ReactElement;
}

// Opens the menu where a right-click near the top of the card would.
const openContextMenuOn = (target: HTMLElement) => {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + Math.min(rect.height / 3, 120),
    }),
  );
};

export const ModContextMenu = ({
  mod,
  hint = false,
  onSelect,
  selected = false,
  children,
}: ModContextMenuProps) => {
  const { t } = useTranslation();
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const profileId = usePersistedStore((state) => state.activeProfileId);
  const groups = usePersistedStore(
    (state) => state.profiles[profileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const assignGroup = useMoveModsToGroup();
  const groupId =
    groups.find((group) => group.modIds.includes(mod.remoteId))?.id ?? "";
  const {
    reinstall: handleReinstall,
    isReinstalling,
    isBusy: isReinstallBusy,
    canReinstall,
  } = useReinstallAction(mod);

  const handleShareMod = async () => {
    if (mod.remoteUrl) {
      try {
        await navigator.clipboard.writeText(mod.remoteUrl);
        toast.success(t("contextMenu.urlCopied"));
      } catch (error) {
        console.error("Failed to copy URL to clipboard:", error);
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
          modId: mod.remoteId,
          vpkFiles: mod.installedVpks,
          profileFolder,
          isMap: mod.isMap ?? false,
        });
        toast.success(t("contextMenu.openedModInGame"));
      } else {
        await invoke("open_game_folder");
        toast.success(t("contextMenu.openedGameFolder"));
      }
    } catch (error) {
      console.error("Failed to open game folder:", error);
      toast.error(t("contextMenu.failedToOpenGameFolder"));
    }
  };

  return (
    <ContextMenu
      onOpenChange={(open) => open && markFeatureUsed("mod-context-menu")}>
      <ContextMenuTrigger asChild>
        {hint ? (
          <HintAnchor
            hintId='mod-context-menu'
            onShowMe={openContextMenuOn}
            side='bottom'>
            {children}
          </HintAnchor>
        ) : (
          children
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className='w-60'>
        {onSelect && (
          <>
            <ContextMenuItem onClick={onSelect}>
              <SquareCheck className='mr-2 h-4 w-4' />
              {selected ? t("contextMenu.deselect") : t("contextMenu.select")}
            </ContextMenuItem>
            {mod.remoteUrl && <ContextMenuSeparator />}
          </>
        )}
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
        {canReinstall && (
          <ContextMenuItem disabled={isReinstallBusy} onClick={handleReinstall}>
            <ArrowClockwiseIcon
              className={cn("mr-2 h-4 w-4", isReinstalling && "animate-spin")}
            />
            {t("reinstall.action")}
          </ContextMenuItem>
        )}
        <ModHealthMenuItems mod={mod} />
        {groups.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                {t("myMods.groups.moveTo")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuRadioGroup
                  value={groupId}
                  onValueChange={(id) =>
                    assignGroup(profileId, [mod.remoteId], id || null)
                  }>
                  {groups.map((group) => (
                    <ContextMenuRadioItem key={group.id} value={group.id}>
                      {group.name}
                    </ContextMenuRadioItem>
                  ))}
                  <ContextMenuRadioItem value=''>
                    {t("myMods.groups.ungrouped")}
                  </ContextMenuRadioItem>
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
