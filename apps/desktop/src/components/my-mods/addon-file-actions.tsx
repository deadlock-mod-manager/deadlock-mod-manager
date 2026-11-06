import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Archive, Plus, Trash2 } from "@deadlock-mods/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { PROFILE_VPKS_QUERY_KEY } from "@/hooks/use-vpk-scan";
import { getErrorMessage } from "@/lib/errors";
import logger from "@/lib/logger";
import { addLeftoverToLibrary } from "@/lib/mods/analysis-leftovers";
import { usePersistedStore } from "@/lib/store";
import { deleteProfileVpk, quarantineProfileVpk } from "@/lib/tauri-commands";
import type { LocalAddonInfo } from "@/types/mods";

interface AddonFileActionsProps {
  addon: LocalAddonInfo;
  /** For a leftover, the mod Add to Library brings back. */
  leftoverOf?: string;
  profileFolder: string | null;
  disabled: boolean;
}

/**
 * Choices for a file Analyze couldn't place: a leftover parked file whose mod
 * left the library, or an unknown file. Each acts on this one file only.
 */
export const AddonFileActions = ({
  addon,
  leftoverOf,
  profileFolder,
  disabled,
}: AddonFileActionsProps) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const removeAnalyzedAddon = usePersistedStore(
    (state) => state.removeAnalyzedAddon,
  );
  const name = addon.fileName;

  const fileRemoved = () => {
    removeAnalyzedAddon(addon.filePath);
    queryClient.invalidateQueries({ queryKey: PROFILE_VPKS_QUERY_KEY });
  };

  const deleteFile = useMutation({
    mutationFn: () => deleteProfileVpk(addon.locator, profileFolder),
    onSuccess: () => {
      fileRemoved();
      toast.success(t("addons.fileActions.deleted", { name }));
    },
    onError: (error) => {
      logger
        .withMetadata({ locator: addon.locator })
        .withError(error)
        .error("Failed to delete an analyzed file");
      toast.error(t("addons.fileActions.deleteError", { name }), {
        description: getErrorMessage(error),
      });
    },
  });

  const quarantineFile = useMutation({
    mutationFn: () => quarantineProfileVpk(addon.locator, profileFolder),
    onSuccess: (destination) => {
      fileRemoved();
      toast.success(t("addons.fileActions.quarantined", { name }), {
        description: t("addons.fileActions.quarantinedDescription"),
        action: {
          label: t("addons.fileActions.showInFolder"),
          onClick: () => {
            invoke("show_in_folder", { path: destination }).catch((error) =>
              logger.withError(error).warn("Failed to show a quarantined file"),
            );
          },
        },
      });
    },
    onError: (error) => {
      logger
        .withMetadata({ locator: addon.locator })
        .withError(error)
        .error("Failed to quarantine an analyzed file");
      toast.error(t("addons.fileActions.quarantineError", { name }), {
        description: getErrorMessage(error),
      });
    },
  });

  const addToLibrary = useMutation({
    mutationFn: (remoteId: string) =>
      addLeftoverToLibrary(remoteId, profileFolder),
    onSuccess: (modName) => {
      toast.success(t("addons.fileActions.added", { name: modName }));
    },
    onError: (error) => {
      logger
        .withMetadata({ remoteId: leftoverOf })
        .withError(error)
        .error("Failed to add a leftover file's mod to the library");
      toast.error(t("addons.fileActions.addError", { name }), {
        description: getErrorMessage(error),
      });
    },
  });

  const busy =
    disabled ||
    deleteFile.isPending ||
    quarantineFile.isPending ||
    addToLibrary.isPending;

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: t("addons.fileActions.deleteConfirmTitle", { name }),
      body: t("addons.fileActions.deleteConfirmBody", { name }),
      tone: "destructive",
      actionButton: t("addons.fileActions.deleteConfirmAction"),
      actionButtonVariant: "destructive",
    });
    if (confirmed) deleteFile.mutate();
  };

  return (
    <>
      {leftoverOf && (
        <Button
          size='sm'
          variant='outline'
          disabled={busy}
          onClick={() => addToLibrary.mutate(leftoverOf)}
          className='h-7 text-xs'>
          <Plus className='w-3 h-3 mr-1' />
          {t("addons.fileActions.addToLibrary")}
        </Button>
      )}
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={() => quarantineFile.mutate()}
        className='h-7 text-xs'>
        <Archive className='w-3 h-3 mr-1' />
        {t("addons.fileActions.quarantine")}
      </Button>
      <Button
        size='sm'
        variant='outline'
        disabled={busy}
        onClick={handleDelete}
        className='h-7 text-xs text-destructive'>
        <Trash2 className='w-3 h-3 mr-1' />
        {t("addons.fileActions.delete")}
      </Button>
    </>
  );
};
