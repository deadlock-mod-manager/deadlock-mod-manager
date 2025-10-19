import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { open } from "@tauri-apps/plugin-shell";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { ReportButton } from "@/components/reports/report-button";
import { ReportCounter } from "@/components/reports/report-counter";

type StoreRowProps = {
  mod: ModDto;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

export const StoreRow = memo(({ mod, isSelected, onSelect }: StoreRowProps) => {
  const { t } = useTranslation();
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
        <div
          className={
            isSelected
              ? "h-10 w-1 rounded bg-primary"
              : "h-10 w-1 rounded bg-transparent"
          }
        />
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
            {mod.author}
          </div>
          <div className='flex items-center gap-2 mt-1'>
            {mod.remoteUrl && (
              <Button
                className='px-0 h-6 text-xs'
                variant='link'
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await open(mod.remoteUrl);
                  } catch {}
                }}>
                {t("plugins.sudo.viewOriginalPost")}
              </Button>
            )}
            <ReportButton
              mod={{ id: mod.id, name: mod.name, author: mod.author }}
            />
            <ReportCounter modId={mod.id} variant='indicator' />
          </div>
        </div>
      </div>
    </li>
  );
});

export default StoreRow;
