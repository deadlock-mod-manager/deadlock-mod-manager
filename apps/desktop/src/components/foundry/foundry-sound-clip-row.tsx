import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  PauseIcon,
  PlayIcon,
  SpeakerSimpleXIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry } from "@/types/foundry";
import { useClipInfo } from "./use-foundry-clip-info";
import { Waveform } from "./foundry-sound-waveform";
import { formatDuration } from "./foundry-sound-utils";

export const ClipRow = memo(function ClipRow({
  entry,
  name,
  selected,
  edited,
  playing,
  loading,
  unplayable,
  progress,
  eager,
  revision,
  onToggle,
  onSelect,
  onDropFile,
}: {
  entry: FoundryEntry;
  name: string;
  selected: boolean;
  edited: boolean;
  playing: boolean;
  loading: boolean;
  unplayable: boolean;
  progress: number;
  eager: boolean;
  revision: number;
  onToggle: (entry: FoundryEntry) => void;
  onSelect: (entry: FoundryEntry) => void;
  onDropFile: (entry: FoundryEntry, file: File) => void;
}) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const info = useClipInfo(
    entry.path,
    false,
    eager || selected || playing,
    revision,
  );

  return (
    <li
      className={cn(
        "group flex items-center gap-3.5 rounded-lg border px-3 py-2.5 transition-colors",
        playing
          ? "border-orange-400/25 bg-orange-400/[0.06]"
          : selected
            ? "border-primary/25 bg-primary/[0.06]"
            : "border-transparent hover:bg-card",
        over && "border-primary bg-primary/10",
      )}
      onDragLeave={() => setOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onDropFile(entry, file);
      }}>
      <button
        aria-label={t(playing ? "foundry.sounds.pause" : "foundry.sounds.play")}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          playing
            ? "bg-orange-400 text-background"
            : "bg-muted text-foreground hover:bg-muted/70",
        )}
        disabled={loading}
        onClick={() => onToggle(entry)}
        type='button'>
        {unplayable ? (
          <SpeakerSimpleXIcon className='h-3.5 w-3.5 text-muted-foreground' />
        ) : playing ? (
          <PauseIcon className='h-3.5 w-3.5' weight='fill' />
        ) : (
          <PlayIcon
            className={cn("h-3.5 w-3.5", loading && "animate-pulse")}
            weight='fill'
          />
        )}
      </button>
      <button
        className='flex w-44 min-w-0 shrink-0 flex-col gap-0.5 text-left'
        onClick={() => onSelect(entry)}
        title={entry.path}
        type='button'>
        <span className='flex items-center gap-1.5'>
          <span
            className={cn(
              "truncate text-[13px]",
              playing || selected ? "font-semibold" : "font-medium",
            )}>
            {name}
          </span>
          {edited && (
            <span className='flex shrink-0 items-center gap-1 rounded bg-orange-400/15 px-1.5 py-px font-semibold text-[9px] text-orange-400'>
              <span className='h-[5px] w-[5px] rounded-full bg-orange-400' />
              {t("foundry.cards.replaced")}
            </span>
          )}
        </span>
        <span className='truncate font-mono text-[10px] text-muted-foreground/70'>
          {entry.filename}
        </span>
      </button>
      <button
        className='min-w-0 flex-1'
        onClick={() => onSelect(entry)}
        tabIndex={-1}
        type='button'>
        <Waveform
          height={26}
          peaks={info?.peaks ?? null}
          played={playing ? progress : 0}
          tone={playing ? "ember" : "primary"}
        />
      </button>
      <span className='w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground'>
        {info ? formatDuration(info.duration) : ""}
      </span>
      <button
        aria-label={t("foundry.sounds.replace")}
        className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100'
        onClick={() => onSelect(entry)}
        title={t("foundry.sounds.replace")}
        type='button'>
        <UploadSimpleIcon className='h-3.5 w-3.5' />
      </button>
    </li>
  );
});
