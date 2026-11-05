import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { PreviewAnimation } from "@/types/generated/PreviewAnimation";
import type { PreviewAnimationChoice } from "@/types/generated/PreviewAnimationChoice";
import { Timeline } from "./viewer-timeline";
import { ViewerAnimationPicker } from "./workbench-viewer-animation-picker";

interface Props {
  actions: PreviewAnimationChoice[];
  selected: PreviewAnimationChoice | null;
  animation: PreviewAnimation | null;
  timeRef: RefObject<number>;
  playing: boolean;
  disabled: boolean;
  speed: number;
  onPlayingChange: (value: boolean) => void;
  onSpeedChange: (value: number) => void;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onRestart: () => void;
  children: ReactNode;
}

export function WorkbenchPlaybackControls({
  actions,
  selected,
  animation,
  timeRef,
  playing,
  disabled,
  speed,
  onPlayingChange,
  onSpeedChange,
  onSelect,
  onSeek,
  onRestart,
  children,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      className='shrink-0 space-y-1 border-t bg-card px-3 py-2'
      aria-label={t("modelPreview.animation")}>
      <Timeline
        animation={animation}
        timeRef={timeRef}
        onSeek={onSeek}
        className='w-full'
      />
      <div className='flex h-8 items-center gap-1.5'>
        <Button
          size='icon'
          variant='secondary'
          className='size-7 shrink-0'
          disabled={disabled || !animation}
          aria-label={t(playing ? "modelPreview.pause" : "modelPreview.play")}
          onClick={() => onPlayingChange(!playing)}>
          {playing ? <PauseIcon weight='fill' /> : <PlayIcon weight='fill' />}
        </Button>
        <Button
          size='icon'
          variant='ghost'
          className='size-7 shrink-0'
          disabled={!animation}
          aria-label={t("modelPreview.restart")}
          title={t("modelPreview.restart")}
          onClick={onRestart}>
          <SkipBackIcon />
        </Button>
        <ViewerAnimationPicker
          compact
          actions={actions}
          selected={selected}
          onSelect={onSelect}
        />
        <select
          aria-label={t("modelPreview.speed")}
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
          className='h-7 shrink-0 rounded border bg-background px-1.5 font-mono text-[11px]'>
          {[0.25, 0.5, 1, 1.5, 2].map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size='icon'
              variant='ghost'
              className='size-7 shrink-0'
              aria-label={t("modelPreview.previewOptions")}
              title={t("modelPreview.previewOptions")}>
              <SlidersHorizontalIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side='top'
            align='end'
            className='max-h-96 w-80 space-y-3 overflow-auto p-3'>
            <h3 className='text-xs font-semibold'>
              {t("modelPreview.previewOptions")}
            </h3>
            {children}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
