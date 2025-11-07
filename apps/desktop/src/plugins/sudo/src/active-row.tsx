import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowLeft } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { usePersistedStore } from "@/lib/store";
import { type LocalMod, ModStatus } from "@/types/mods";

type ActiveRowProps = {
  mod: LocalMod;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

export const ActiveRow = ({ mod, isSelected, onSelect }: ActiveRowProps) => {
  const { t } = useTranslation();

  const removeWithoutDialog = async () => {
    try {
      if (mod.status === ModStatus.Installed) {
        const activeProfile = usePersistedStore.getState().getActiveProfile();
        const profileFolder = activeProfile?.folderName ?? null;

        await invoke("purge_mod", {
          modId: mod.remoteId,
          vpks: mod.installedVpks ?? [],
          profileFolder,
        });
      }
      usePersistedStore.getState().removeMod(mod.remoteId);
      toast.success(t("mods.deleteSuccess"));
    } catch {
      toast.error(t("mods.deleteError"));
    }
  };

  return (
    <li
      aria-selected={isSelected}
      className={
        isSelected
          ? "group flex items-center justify-between p-2 cursor-pointer rounded bg-accent ring-1 ring-primary/40 transition-colors"
          : "group flex items-center justify-between p-2 cursor-pointer rounded hover:bg-accent/40 transition-colors"
      }
      onClick={() => onSelect(mod.remoteId)}
      role='option'>
      <div className='min-w-0 flex items-center gap-3'>
        {mod.isAudio ? (
          <AudioPlayerPreview
            audioUrl={mod.audioUrl || ""}
            onPlayClick={(e) => e.stopPropagation()}
            variant='compact'
            className='h-12 w-12'
          />
        ) : mod.images && mod.images.length > 0 ? (
          <img
            alt={mod.name}
            className='h-12 w-12 rounded object-cover'
            src={mod.images[0]}
          />
        ) : (
          <div className='h-12 w-12 rounded bg-muted' />
        )}
        <div className='min-w-0'>
          <div className='truncate font-medium'>{mod.name}</div>
          <div className='truncate text-xs text-muted-foreground'>
            {mod.status}
          </div>
        </div>
      </div>
      <Button
        size='icon'
        title={t("plugins.sudo.removeMod") || "Remove"}
        variant='outline'
        onClick={removeWithoutDialog}>
        <ArrowLeft className='h-4 w-4' />
      </Button>
    </li>
  );
};

export default ActiveRow;
