import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  InfoIcon,
  SpeakerHighIcon,
  SpeakerXIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryEntry, FoundrySoundGroup } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryDropZone } from "./foundry-drop-zone";
import { type SoundPlayer } from "./use-foundry-sound-player";
import { useClipInfo } from "./use-foundry-clip-info";
import {
  sharedPrefix,
  clipName,
  formatDuration,
  SOUND_EXTENSIONS,
} from "./foundry-sound-utils";
import { Waveform } from "./foundry-sound-waveform";
import { InGameSection } from "./foundry-sound-in-game-section";

export const ClipInspector = ({
  entry,
  group,
  player,
  revision,
}: {
  entry: FoundryEntry | null;
  group: FoundrySoundGroup | null;
  player: SoundPlayer;
  revision: number;
}) => {
  const { t } = useTranslation();
  const { workspace, busy, editedPaths, replaceEntry, revertEntry } =
    useFoundry();
  const volume = usePersistedStore((state) => state.foundrySoundVolume);
  const setVolume = usePersistedStore((state) => state.setFoundrySoundVolume);
  const edited = entry ? editedPaths.has(entry.path) : false;
  const { state, progress } = player;
  const mine =
    entry !== null && state.status !== "idle" && state.path === entry.path;
  const listeningOriginal = mine && state.original;
  const [side, setSide] = useState<"yours" | "original">("yours");
  const original = edited && (mine ? listeningOriginal : side === "original");
  const info = useClipInfo(entry?.path ?? null, original, true, revision);
  const playing = mine && state.status === "playing";

  useEffect(() => {
    if (!playing || !edited) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      player.flip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, edited, player]);

  const replace = useCallback(
    async (path: string) => {
      if (!entry) return;
      try {
        await replaceEntry(entry.path, path);
        toast.success(t("foundry.editor.replaced", { file: entry.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [entry, replaceEntry, t],
  );

  if (!entry) {
    return (
      <p className='p-4 text-muted-foreground text-sm'>
        {t("foundry.sounds.pick")}
      </p>
    );
  }

  const prefix = group
    ? sharedPrefix(group.entries.map((e) => e.filename))
    : "";
  const disabled = !workspace || busy;
  const elapsed = mine && info ? progress * info.duration : 0;

  return (
    <>
      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-0.5 border-b px-4 py-3.5'>
          <p className='truncate font-semibold text-sm'>
            {clipName(entry.filename, prefix)}
          </p>
          <p className='truncate text-[11px] text-muted-foreground'>
            {[
              group?.label,
              info ? formatDuration(info.duration) : null,
              edited ? t("foundry.cards.stateReplaced") : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>

        <section className='space-y-3 border-b px-4 py-3.5'>
          <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t(edited ? "foundry.sounds.compare" : "foundry.sounds.listen")}
          </h3>
          {edited && (
            <div className='flex gap-0.5 rounded-[7px] border bg-background p-[3px]'>
              {(["yours", "original"] as const).map((option) => {
                const active = (option === "original") === original;
                return (
                  <button
                    aria-pressed={active}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 py-[5px] font-semibold text-xs transition-colors",
                      active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    key={option}
                    onClick={() => {
                      setSide(option);
                      if (playing && active === false) player.flip();
                    }}
                    type='button'>
                    {option === "yours" && (
                      <span className='h-1.5 w-1.5 rounded-full bg-orange-400' />
                    )}
                    {t(`foundry.sounds.${option}`)}
                  </button>
                );
              })}
            </div>
          )}
          <button
            aria-label={t(
              playing ? "foundry.sounds.pause" : "foundry.sounds.play",
            )}
            className='flex h-[60px] w-full items-center rounded-lg bg-background px-2.5'
            onClick={() => player.toggle(entry.path, original)}
            type='button'>
            <Waveform
              height={44}
              peaks={info?.peaks ?? null}
              played={mine ? progress : 0}
              tone={original ? "primary" : edited ? "ember" : "primary"}
            />
          </button>
          <div className='flex font-mono text-[10px] text-muted-foreground'>
            <span>{formatDuration(elapsed)}</span>
            <span className='ml-auto'>
              {info ? formatDuration(info.duration) : ""}
            </span>
          </div>
          {edited && (
            <p className='flex items-start gap-1.5 text-[11px] text-muted-foreground/80 leading-[1.4]'>
              <InfoIcon className='mt-px h-[13px] w-[13px] shrink-0' />
              {t("foundry.sounds.flipHint")}
            </p>
          )}
        </section>

        <section className='space-y-2.5 px-4 py-3.5'>
          <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t("foundry.editor.replaceLabel")}
          </h3>
          <FoundryDropZone
            dialogTitle={t("foundry.editor.replaceTitle")}
            disabled={disabled}
            extensions={SOUND_EXTENSIONS}
            onFile={replace}
            title={t("foundry.drop.sound")}
          />
          <button
            className={cn(
              "flex items-center gap-1.5 font-medium text-xs transition-colors",
              edited && !disabled
                ? "text-foreground hover:text-primary"
                : "pointer-events-none text-muted-foreground/50",
            )}
            disabled={!edited || disabled}
            onClick={() =>
              revertEntry(entry.path).catch((err) => {
                logger.withError(err).error("[Foundry] Revert failed");
                toast.error(t("foundry.editor.revertFailed"));
              })
            }
            type='button'>
            <ArrowCounterClockwiseIcon className='h-[13px] w-[13px]' />
            {t("foundry.editor.revertToOriginal")}
          </button>
        </section>
        <InGameSection disabled={disabled} entryPath={entry.path} />
      </ScrollArea>
      <div className='flex shrink-0 items-center gap-2.5 border-t px-4 py-3'>
        <button
          aria-label={t(
            volume <= 0 ? "foundry.sounds.unmute" : "foundry.sounds.mute",
          )}
          className='text-muted-foreground hover:text-foreground'
          onClick={() => setVolume(volume <= 0 ? 0.8 : 0)}
          type='button'>
          {volume <= 0 ? (
            <SpeakerXIcon className='h-[15px] w-[15px]' />
          ) : (
            <SpeakerHighIcon className='h-[15px] w-[15px]' />
          )}
        </button>
        <Slider
          aria-label={t("foundry.sounds.volume")}
          className='flex-1'
          max={1}
          min={0}
          onValueChange={([next]) => setVolume(next)}
          step={0.05}
          value={[volume]}
        />
        <span className='w-9 shrink-0 text-right font-mono text-[11px] text-muted-foreground'>
          {Math.round(volume * 100)}%
        </span>
      </div>
    </>
  );
};
