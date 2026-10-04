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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { FoundryEntry, FoundrySoundGroup } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { chunkEntries, chunkSizeStyle } from "./foundry-chunks";
import { formatBytes } from "./foundry-entry-list";

/** Playback state of the single shared `<audio>` element. */
type Playback =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "playing"; path: string }
  | { kind: "unplayable"; path: string };

const IDLE: Playback = { kind: "idle" };

type RowPlayback = Exclude<Playback["kind"], "idle"> | null;

/** The playback state that concerns one row, so idle rows see a stable `null`. */
const playbackFor = (playback: Playback, path: string): RowPlayback =>
  "path" in playback && playback.path === path ? playback.kind : null;

const SoundRow = memo(function SoundRow({
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
  playback: RowPlayback;
  onSelect: (entry: FoundryEntry) => void;
  onToggle: (entry: FoundryEntry) => void;
}) {
  const { t } = useTranslation();
  const isPlaying = playback === "playing";
  const isLoading = playback === "loading";
  const isUnplayable = playback === "unplayable";

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
});

const ROW_HEIGHT_PX = 44;

interface RowHandlers {
  editedPaths: ReadonlySet<string>;
  onSelect: (entry: FoundryEntry) => void;
  onToggle: (entry: FoundryEntry) => void;
}

/** A slice of a group's rows; voice lines alone can run to thousands. */
const SoundChunk = memo(function SoundChunk({
  entries,
  selectedPath,
  playback,
  editedPaths,
  onSelect,
  onToggle,
}: RowHandlers & {
  entries: FoundryEntry[];
  selectedPath: string | null;
  playback: Playback;
}) {
  return (
    <ul
      className='space-y-0.5 [content-visibility:auto]'
      style={chunkSizeStyle(entries.length, ROW_HEIGHT_PX)}>
      {entries.map((entry) => (
        <SoundRow
          entry={entry}
          isEdited={editedPaths.has(entry.path)}
          isSelected={entry.path === selectedPath}
          key={entry.path}
          onSelect={onSelect}
          onToggle={onToggle}
          playback={playbackFor(playback, entry.path)}
        />
      ))}
    </ul>
  );
});

const SoundGroupSection = memo(function SoundGroupSection({
  group,
  selectedPath,
  playback,
  ...handlers
}: RowHandlers & {
  group: FoundrySoundGroup;
  selectedPath: string | null;
  playback: Playback;
}) {
  const chunks = useMemo(() => chunkEntries(group.entries), [group.entries]);
  const playingPath = "path" in playback ? playback.path : null;

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
      <div className='space-y-0.5'>
        {chunks.map((chunk) => (
          <SoundChunk
            {...handlers}
            entries={chunk.entries}
            key={chunk.entries[0].path}
            playback={
              playingPath !== null && chunk.paths.has(playingPath)
                ? playback
                : IDLE
            }
            selectedPath={
              selectedPath !== null && chunk.paths.has(selectedPath)
                ? selectedPath
                : null
            }
          />
        ))}
      </div>
    </section>
  );
});

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
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Read through refs so the toggle handler stays stable and the memoized
  // rows don't all re-render on every playback change or volume tick.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("ended", () => setPlayback(IDLE));
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

      const current = playbackRef.current;
      if (current.kind === "playing" && current.path === entry.path) {
        audio.pause();
        setPlayback(IDLE);
        return;
      }

      audio.pause();
      setPlayback({ kind: "loading", path: entry.path });
      try {
        audio.volume = volumeRef.current;
        audio.src = await playSound(entry.path);
        await audio.play();
        setPlayback({ kind: "playing", path: entry.path });
      } catch (err) {
        // Not every compiled clip is MP3; those simply have no preview.
        logger.withError(err).warn("[Foundry] Sound preview unavailable");
        setPlayback({ kind: "unplayable", path: entry.path });
      }
    },
    [playSound],
  );

  const handleSelect = useCallback(
    (entry: FoundryEntry) => setSelectedEntryPath(entry.path),
    [setSelectedEntryPath],
  );

  const groups = useMemo(() => manifest?.soundGroups ?? [], [manifest]);
  // Which group holds each clip, so selection and playback only reach the
  // groups they touch; the rest keep their props and skip rendering.
  const groupIdByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const entry of group.entries) map.set(entry.path, group.id);
    }
    return map;
  }, [groups]);
  const selectedGroupId =
    selectedEntryPath === null
      ? undefined
      : groupIdByPath.get(selectedEntryPath);
  const playingGroupId =
    "path" in playback ? groupIdByPath.get(playback.path) : undefined;

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
          onSelect={handleSelect}
          onToggle={handleToggle}
          playback={group.id === playingGroupId ? playback : IDLE}
          selectedPath={group.id === selectedGroupId ? selectedEntryPath : null}
        />
      ))}
    </div>
  );
};
