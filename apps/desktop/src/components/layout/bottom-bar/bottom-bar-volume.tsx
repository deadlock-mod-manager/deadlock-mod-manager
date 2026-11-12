import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Slider } from "@deadlock-mods/ui/components/slider";
import {
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export function BottomBarVolume() {
  const { t } = useTranslation();
  const audioVolume = usePersistedStore((state) => state.audioVolume);
  const setAudioVolume = usePersistedStore((state) => state.setAudioVolume);
  const [open, setOpen] = useState(false);
  const [localVolume, setLocalVolume] = useState(audioVolume);

  useEffect(() => {
    if (open) setLocalVolume(audioVolume);
  }, [open, audioVolume]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setAudioVolume(localVolume);
    setOpen(next);
  };

  let VolumeIcon: typeof SpeakerSlashIcon;

  if (audioVolume === 0) {
    VolumeIcon = SpeakerSlashIcon;
  } else if (audioVolume < 50) {
    VolumeIcon = SpeakerLowIcon;
  } else {
    VolumeIcon = SpeakerHighIcon;
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-haspopup='dialog'
          aria-label={t("settings.audioVolume")}
          className='flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'>
          <VolumeIcon className='h-3 w-3 shrink-0' />
          <span className='flex items-baseline gap-0.5'>
            <span>{t("common.volume").toUpperCase()}:</span>
            <span className='w-9 tabular-nums text-right'>{audioVolume}%</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-48 border bg-background p-3'
        side='top'
        sideOffset={8}>
        <div className='space-y-2'>
          <span className='text-xs font-medium uppercase text-muted-foreground'>
            {t("common.volume")}: {localVolume}%
          </span>
          <Slider
            aria-label={t("settings.audioVolume")}
            max={100}
            min={0}
            onValueChange={(value) => setLocalVolume(value[0])}
            onValueCommit={(value) => setAudioVolume(value[0])}
            step={1}
            value={[localVolume]}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
