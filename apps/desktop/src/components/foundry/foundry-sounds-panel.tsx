import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSimpleXIcon,
  SpeakerXIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryEntry, FoundrySoundGroup } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { formatBytes } from "./foundry-entry-list";

/** Playback state of the single shared `<audio>` element. */
type Playback =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "playing"; path: string }
  | { kind: "unplayable"; path: string };

const SoundRow = ({
  entry,
  isSelected,
  isEdited,
  playback,
  onSelect,
  onToggle,
}: {
  entry: FoundryEntry;
  isSelected: boolean;
  isEdited: boolean;
  playback: Playback;
  onSelect: (entry: FoundryEntry) => void;
  onToggle: (entry: FoundryEntry) => void;
}) => {
  const { t } = useTranslation();
  const isActive = "path" in playback && playback.path === entry.path;
  const isPlaying = isActive && playback.kind === "playing";
  const isLoading = isActive && playback.kind === "loading";
  const isUnplayable = isActive && playback.kind === "unplayable";

  return (
    <li>
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
          isSelected
            ? "border-primary bg-primary/10"
            : "border-transparent hover:bg-muted",
        )}>
        <Button
          aria-label={
            isPlaying ? t("foundry.sounds.pause") : t("foundry.sounds.play")
          }
          className='h-7 w-7 shrink-0'
          disabled={isLoading}
          onClick={() => onToggle(entry)}
          size='icon'
          variant='ghost'>
          {isUnplayable ? (
            <SpeakerSimpleXIcon className='h-4 w-4 text-muted-foreground' />
          ) : isPlaying ? (
            <PauseIcon className='h-4 w-4' weight='fill' />
          ) : (
            <PlayIcon
              className={cn("h-4 w-4", isLoading && "animate-pulse")}
              weight='fill'
            />
          )}
        </Button>
        <button
          className='min-w-0 flex-1 truncate text-left text-sm'
          onClick={() => onSelect(entry)}
          title={entry.path}
          type='button'>
          {entry.filename}
        </button>
        {isEdited && (
          <Badge className='shrink-0 text-[10px]' variant='default'>
            {t("foundry.edited")}
          </Badge>
        )}
        <span className='shrink-0 text-muted-foreground text-xs'>
          {formatBytes(entry.size)}
        </span>
      </div>
    </li>
  );
};

const SoundGroupSection = ({
  group,
  ...rowProps
}: {
  group: FoundrySoundGroup;
  selectedPath: string | null;
  editedPaths: ReadonlySet<string>;
  playback: Playback;
  onSelect: (entry: FoundryEntry) => void;
  onToggle: (entry: FoundryEntry) => void;
}) => {
  const { selectedPath, editedPaths, playback, onSelect, onToggle } = rowProps;
  return (
    <section className='space-y-1.5'>
      <div className='flex items-center gap-2'>
        <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted/60'>
          <MusicNotesIcon
            className='h-3.5 w-3.5 text-muted-foreground'
            weight='duotone'
          />
        </div>
        <h3 className='min-w-0 flex-1 truncate font-medium text-sm'>
          {group.label}
        </h3>
        {group.slot !== null && (
          <Badge className='text-[10px]' variant='secondary'>
            {group.slot === 4 ? "ULT" : group.slot}
          </Badge>
        )}
        <Badge className='text-[10px]' variant='outline'>
          {group.entries.length}
        </Badge>
      </div>
      <ul className='space-y-0.5'>
        {group.entries.map((entry) => (
          <SoundRow
            entry={entry}
            isEdited={editedPaths.has(entry.path)}
            isSelected={entry.path === selectedPath}
            key={entry.path}
            onSelect={onSelect}
            onToggle={onToggle}
            playback={playback}
          />
        ))}
      </ul>
    </section>
  );
};

/** Playback volume for the previews, kept beside the list it controls. */
const VolumeControl = ({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (volume: number) => void;
}) => {
  const { t } = useTranslation();
  const muted = volume <= 0;

  return (
    <div className='flex items-center gap-2'>
      <Button
        aria-label={t(muted ? "foundry.sounds.unmute" : "foundry.sounds.mute")}
        className='h-7 w-7 shrink-0'
        // Muting remembers nothing: the slider is right there, so restoring a
        // previous level would just be a second, invisible piece of state.
        onClick={() => onChange(muted ? 0.8 : 0)}
        size='icon'
        title={t("foundry.sounds.volume")}
        variant='ghost'>
        {muted ? (
          <SpeakerXIcon className='h-4 w-4 text-muted-foreground' />
        ) : (
          <SpeakerHighIcon className='h-4 w-4' />
        )}
      </Button>
      <Slider
        aria-label={t("foundry.sounds.volume")}
        className='w-24'
        max={1}
        min={0}
        onValueChange={([next]) => onChange(next)}
        step={0.05}
        value={[volume]}
      />
      <span className='w-8 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums'>
        {Math.round(volume * 100)}
      </span>
    </div>
  );
};

/**
 * The sound tab: a hero's clips grouped by ability slot (plus voice, weapon and
 * catch-all buckets), each row playable in place. Selecting a row hands it to
 * the inspector, where it can be replaced.
 */
export const FoundrySoundsPanel = () => {
  const { t } = useTranslation();
  const {
    manifest,
    selectedEntryPath,
    setSelectedEntryPath,
    editedPaths,
    playSound,
  } = useFoundry();
  const volume = usePersistedStore((state) => state.foundrySoundVolume);
  const setVolume = usePersistedStore((state) => state.setFoundrySoundVolume);
  const [playback, setPlayback] = useState<Playback>({ kind: "idle" });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("ended", () => setPlayback({ kind: "idle" }));
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Applied to the live element too, so dragging the slider is audible during
  // playback rather than only on the next clip.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleToggle = useCallback(
    async (entry: FoundryEntry) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (playback.kind === "playing" && playback.path === entry.path) {
        audio.pause();
        setPlayback({ kind: "idle" });
        return;
      }

      audio.pause();
      setPlayback({ kind: "loading", path: entry.path });
      try {
        audio.volume = volume;
        audio.src = await playSound(entry.path);
        await audio.play();
        setPlayback({ kind: "playing", path: entry.path });
      } catch (err) {
        // Not every compiled clip is MP3; those simply have no preview.
        logger.withError(err).warn("[Foundry] Sound preview unavailable");
        setPlayback({ kind: "unplayable", path: entry.path });
      }
    },
    [playSound, playback, volume],
  );

  const groups = manifest?.soundGroups ?? [];
  if (groups.length === 0) {
    return (
      <p className='px-2 py-6 text-center text-muted-foreground text-sm'>
        {t("foundry.tabs.soundsEmpty")}
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-end border-b pb-3'>
        <VolumeControl onChange={setVolume} volume={volume} />
      </div>

      {groups.map((group) => (
        <SoundGroupSection
          editedPaths={editedPaths}
          group={group}
          key={group.id}
          onSelect={(entry) => setSelectedEntryPath(entry.path)}
          onToggle={handleToggle}
          playback={playback}
          selectedPath={selectedEntryPath}
        />
      ))}
    </div>
  );
};
