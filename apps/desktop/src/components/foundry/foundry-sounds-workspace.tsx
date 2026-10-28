import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  ChatCircleIcon,
  CrosshairIcon,
  FileCodeIcon,
  FolderIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSimpleXIcon,
  SpeakerXIcon,
  UploadSimpleIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type {
  FoundryEntry,
  FoundrySoundGroup,
  FoundrySoundGroupKind,
} from "@/types/foundry";
import { chunkEntries, chunkSizeStyle } from "./foundry-chunks";
import {
  type FoundrySoundAdjust,
  NO_SOUND_ADJUST,
  useFoundry,
} from "./foundry-context";
import {
  extensionOf,
  FoundryDropZone,
  stageDroppedFile,
} from "./foundry-drop-zone";

/** Audio the backend can mint into a `.vsnd_c`, plus the compiled form itself. */
const SOUND_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "vsnd_c"];

/** The in-game volume range, in dB. Cuts go further than boosts, which clip. */
const GAIN_MIN_DB = -24;
const GAIN_MAX_DB = 12;

/** Groups this small decode every clip's waveform up front. */
const EAGER_WAVEFORM_LIMIT = 40;
/** Peaks kept per clip; drawn bars are resampled from these to fit. */
const PEAK_RESOLUTION = 200;
/** One bar and its gap. */
const BAR_PITCH_PX = 4;

const KIND_ICONS = {
  ability: WaveformIcon,
  voice: ChatCircleIcon,
  weapon: CrosshairIcon,
  soundevents: FileCodeIcon,
  other: FolderIcon,
} satisfies Record<FoundrySoundGroupKind, React.ElementType>;

interface ClipInfo {
  peaks: number[];
  duration: number;
}

type PlayerState =
  | { status: "idle" }
  | {
      status: "loading" | "playing" | "unplayable";
      path: string;
      original: boolean;
    };

const IDLE: PlayerState = { status: "idle" };

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
};

/** Words shared by every clip in a group, so rows can show what differs. */
const sharedPrefix = (names: string[]): string => {
  if (names.length < 2) return "";
  const split = names.map((name) => name.split("_"));
  const prefix: string[] = [];
  for (let i = 0; i < split[0].length - 1; i++) {
    if (split.every((parts) => parts[i] === split[0][i])) {
      prefix.push(split[0][i]);
    } else break;
  }
  return prefix.length > 0 ? `${prefix.join("_")}_` : "";
};

const clipName = (filename: string, prefix: string) => {
  const rest = filename.startsWith(prefix)
    ? filename.slice(prefix.length)
    : filename;
  const words = (rest || filename).replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

let audioContext: AudioContext | null = null;
const clipInfoCache = new Map<string, Promise<ClipInfo | null>>();

/** Decode a clip once and keep its loudness envelope and length. */
const loadClipInfo = (
  key: string,
  url: () => Promise<string>,
): Promise<ClipInfo | null> => {
  const cached = clipInfoCache.get(key);
  if (cached) return cached;
  const pending = (async () => {
    try {
      audioContext ??= new AudioContext();
      const bytes = await (await fetch(await url())).arrayBuffer();
      const buffer = await audioContext.decodeAudioData(bytes);
      const data = buffer.getChannelData(0);
      const size = Math.max(1, Math.floor(data.length / PEAK_RESOLUTION));
      const peaks: number[] = [];
      let loudest = 0;
      for (let bar = 0; bar < PEAK_RESOLUTION; bar++) {
        let peak = 0;
        for (let i = bar * size; i < (bar + 1) * size && i < data.length; i++) {
          peak = Math.max(peak, Math.abs(data[i]));
        }
        peaks.push(peak);
        loudest = Math.max(loudest, peak);
      }
      return {
        peaks: peaks.map((peak) => (loudest > 0 ? peak / loudest : 0)),
        duration: buffer.duration,
      };
    } catch (err) {
      logger.withError(err).warn("[Foundry] Could not decode a clip");
      return null;
    }
  })();
  clipInfoCache.set(key, pending);
  return pending;
};

const useClipInfo = (
  path: string | null,
  original: boolean,
  enabled: boolean,
  revision: number,
) => {
  const { playSound, manifest } = useFoundry();
  const [info, setInfo] = useState<ClipInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!path || !enabled || !manifest) return;
    let cancelled = false;
    const key = `${manifest.filePath}\n${path}\n${original}\n${revision}`;
    void loadClipInfo(key, () => playSound(path, original)).then((loaded) => {
      if (!cancelled) setInfo(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [path, original, enabled, manifest, playSound, revision]);
  return info;
};

const Waveform = ({
  peaks,
  height,
  played,
  tone,
}: {
  peaks: number[] | null;
  height: number;
  played: number;
  tone: "primary" | "ember";
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setBars(Math.floor(entry.contentRect.width / BAR_PITCH_PX)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Each bar takes the loudest peak in its span, so a quiet gap between two
  // hits never hides one of them.
  const values = useMemo(() => {
    if (!peaks) return Array.from({ length: bars }, () => 0.08);
    const span = peaks.length / Math.max(bars, 1);
    return Array.from({ length: bars }, (_, i) =>
      Math.max(
        ...peaks.slice(
          Math.floor(i * span),
          Math.max(Math.floor((i + 1) * span), Math.floor(i * span) + 1),
        ),
      ),
    );
  }, [peaks, bars]);
  const playedBars = Math.round(played * bars);
  const barPath = (from: number, to: number) =>
    values
      .slice(from, to)
      .map((value, i) => {
        const x = (from + i) * BAR_PITCH_PX + 1;
        const half = Math.max(1, (value * height) / 2);
        return `M${x} ${height / 2 - half}V${height / 2 + half}`;
      })
      .join("");

  return (
    <div aria-hidden className='w-full' ref={ref} style={{ height }}>
      <svg
        className='block'
        height={height}
        role='presentation'
        width={bars * BAR_PITCH_PX}>
        <path
          className='stroke-muted-foreground/30'
          d={barPath(playedBars, bars)}
          strokeLinecap='round'
          strokeWidth={2}
        />
        <path
          className={tone === "ember" ? "stroke-orange-400" : "stroke-primary"}
          d={barPath(0, playedBars)}
          strokeLinecap='round'
          strokeWidth={2}
        />
      </svg>
    </div>
  );
};

/** The tab's single audio element, with play-in-order and an A/B flip. */
const useSoundPlayer = () => {
  const { playSound } = useFoundry();
  const volume = usePersistedStore((state) => state.foundrySoundVolume);
  const [state, setState] = useState<PlayerState>(IDLE);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<FoundryEntry[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const play = useCallback(
    async (path: string, original = false, startAt = 0) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      setState({ status: "loading", path, original });
      try {
        audio.volume = volumeRef.current;
        audio.src = await playSound(path, original);
        audio.currentTime = startAt;
        await audio.play();
        setState({ status: "playing", path, original });
      } catch (err) {
        logger.withError(err).warn("[Foundry] Sound preview unavailable");
        setState({ status: "unplayable", path, original });
      }
    },
    [playSound],
  );

  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("timeupdate", () =>
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0),
    );
    audio.addEventListener("ended", () => {
      setProgress(0);
      const next = queueRef.current.shift();
      if (next) void play(next.path);
      else setState(IDLE);
    });
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [play]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stop = useCallback(() => {
    queueRef.current = [];
    audioRef.current?.pause();
    setState(IDLE);
    setProgress(0);
  }, []);

  const toggle = useCallback(
    (path: string, original = false) => {
      const current = stateRef.current;
      if (
        current.status === "playing" &&
        current.path === path &&
        current.original === original
      ) {
        stop();
        return;
      }
      queueRef.current = [];
      void play(path, original);
    },
    [play, stop],
  );

  const playAll = useCallback(
    (entries: FoundryEntry[]) => {
      const [first, ...rest] = entries;
      if (!first) return;
      queueRef.current = rest;
      void play(first.path);
    },
    [play],
  );

  /** Swap between the edit and the original without losing the place. */
  const flip = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "playing") return;
    void play(
      current.path,
      !current.original,
      audioRef.current?.currentTime ?? 0,
    );
  }, [play]);

  return { state, progress, toggle, playAll, flip };
};

type SoundPlayer = ReturnType<typeof useSoundPlayer>;

const ClipRow = memo(function ClipRow({
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

const ClipChunk = memo(function ClipChunk({
  entries,
  prefix,
  player,
  selectedPath,
  editedPaths,
  eager,
  revision,
  onToggle,
  onSelect,
  onDropFile,
}: {
  entries: FoundryEntry[];
  prefix: string;
  player: SoundPlayer;
  selectedPath: string | null;
  editedPaths: ReadonlySet<string>;
  eager: boolean;
  revision: number;
  onToggle: (entry: FoundryEntry) => void;
  onSelect: (entry: FoundryEntry) => void;
  onDropFile: (entry: FoundryEntry, file: File) => void;
}) {
  const { state, progress } = player;
  return (
    <ul
      className='space-y-1 [content-visibility:auto]'
      style={chunkSizeStyle(entries.length, 58)}>
      {entries.map((entry) => {
        const mine =
          state.status !== "idle" &&
          state.path === entry.path &&
          !state.original;
        return (
          <ClipRow
            edited={editedPaths.has(entry.path)}
            eager={eager}
            entry={entry}
            key={entry.path}
            loading={mine && state.status === "loading"}
            name={clipName(entry.filename, prefix)}
            onDropFile={onDropFile}
            onSelect={onSelect}
            onToggle={onToggle}
            playing={mine && state.status === "playing"}
            progress={mine ? progress : 0}
            revision={revision}
            selected={entry.path === selectedPath}
            unplayable={mine && state.status === "unplayable"}
          />
        );
      })}
    </ul>
  );
});

const GroupNav = ({
  groups,
  activeId,
  editedPaths,
  onSelect,
}: {
  groups: FoundrySoundGroup[];
  activeId: string | null;
  editedPaths: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const abilities = groups.filter((group) => group.kind === "ability");
  const rest = groups.filter((group) => group.kind !== "ability");

  const item = (group: FoundrySoundGroup) => {
    const Icon = KIND_ICONS[group.kind];
    const active = group.id === activeId;
    const edited = group.entries.some((entry) => editedPaths.has(entry.path));
    return (
      <button
        aria-current={active}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
          active ? "bg-secondary" : "hover:bg-muted",
        )}
        key={group.id}
        onClick={() => onSelect(group.id)}
        type='button'>
        <span
          className={cn(
            "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            active
              ? "bg-primary/15 text-primary"
              : "bg-muted text-foreground/80",
          )}>
          {group.slot !== null ? (
            <span className='font-mono font-semibold text-xs'>
              {group.slot}
            </span>
          ) : (
            <Icon className='h-[15px] w-[15px]' />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            active && "font-semibold",
          )}>
          {group.label}
        </span>
        {edited && (
          <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400' />
        )}
        <span className='shrink-0 font-mono text-[10px] text-muted-foreground/60'>
          {group.entries.length.toLocaleString()}
        </span>
      </button>
    );
  };

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-0.5 px-2 py-3'>
        {abilities.length > 0 && (
          <p className='px-2 pt-2 pb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t("foundry.sounds.abilities")}
          </p>
        )}
        {abilities.map(item)}
        {rest.length > 0 && (
          <p className='px-2 pt-3 pb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
            {t("foundry.sounds.hero")}
          </p>
        )}
        {rest.map(item)}
      </div>
    </ScrollArea>
  );
};

const SwitchRow = ({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <label className='flex items-center gap-3'>
    <span className='min-w-0 flex-1'>
      <span className='block font-medium text-xs'>{label}</span>
      <span className='block text-[11px] text-muted-foreground'>{hint}</span>
    </span>
    <Switch
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  </label>
);

/**
 * How loud the clip plays in the game. Each change rebuilds the clip from its
 * source, so edits never stack on audio that was already processed.
 */
const InGameSection = ({
  entryPath,
  disabled,
}: {
  entryPath: string;
  disabled: boolean;
}) => {
  const { t } = useTranslation();
  const { soundSettings, adjustSound } = useFoundry();
  const saved = soundSettings.get(entryPath) ?? NO_SOUND_ADJUST;
  const [draftGain, setDraftGain] = useState<number | null>(null);
  const gain = draftGain ?? saved.gainDb;

  const apply = (change: Partial<FoundrySoundAdjust>) => {
    adjustSound(entryPath, {
      gainDb: saved.gainDb,
      normalize: saved.normalize,
      mute: saved.mute,
      ...change,
    })
      .catch((err) => {
        logger.withError(err).error("[Foundry] Sound adjust failed");
        toast.error(t("foundry.sounds.adjustFailed"));
      })
      .finally(() => setDraftGain(null));
  };

  return (
    <section className='space-y-3.5 border-b px-4 py-3.5'>
      <h3 className='font-semibold text-[10px] text-muted-foreground uppercase tracking-[0.08em]'>
        {t("foundry.sounds.inGame")}
      </h3>
      <div className='space-y-2'>
        <div className='flex items-center text-xs'>
          <span className='font-medium'>{t("foundry.sounds.gain")}</span>
          <span className='ml-auto font-mono text-[11px] text-muted-foreground'>
            {t("foundry.sounds.gainValue", {
              value: gain > 0 ? `+${gain}` : gain,
            })}
          </span>
        </div>
        <div className='relative'>
          <Slider
            aria-label={t("foundry.sounds.gain")}
            disabled={disabled || saved.mute}
            max={GAIN_MAX_DB}
            min={GAIN_MIN_DB}
            onValueChange={([next]) => setDraftGain(next)}
            onValueCommit={([next]) => {
              if (next === saved.gainDb) {
                setDraftGain(null);
              } else {
                apply({ gainDb: next });
              }
            }}
            step={1}
            value={[gain]}
          />
          <span
            aria-hidden
            className='pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50'
            style={{
              left: `${(-GAIN_MIN_DB / (GAIN_MAX_DB - GAIN_MIN_DB)) * 100}%`,
            }}
          />
        </div>
      </div>
      <SwitchRow
        checked={saved.normalize}
        disabled={disabled || saved.mute}
        hint={t("foundry.sounds.normalizeHint")}
        label={t("foundry.sounds.normalize")}
        onCheckedChange={(normalize) => apply({ normalize })}
      />
      <SwitchRow
        checked={saved.mute}
        disabled={disabled}
        hint={t("foundry.sounds.muteClipHint")}
        label={t("foundry.sounds.muteClip")}
        onCheckedChange={(mute) => apply({ mute })}
      />
    </section>
  );
};

const ClipInspector = ({
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

/**
 * The sounds tab: groups on the left, the active group's clips in the middle,
 * the selected clip on the right. Clips play in place, and an edited clip can
 * be flipped against the original mid-playback.
 */
export const FoundrySoundsWorkspace = ({
  sidePanelClassName,
}: {
  sidePanelClassName: string;
}) => {
  const { t } = useTranslation();
  const {
    manifest,
    selectedEntryPath,
    setSelectedEntryPath,
    editedPaths,
    editRevision: revision,
    workspace,
    busy,
    replaceEntry,
  } = useFoundry();
  const player = useSoundPlayer();
  const groups = useMemo(() => manifest?.soundGroups ?? [], [manifest]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const groupOfPath = useMemo(() => {
    const map = new Map<string, FoundrySoundGroup>();
    for (const group of groups) {
      for (const entry of group.entries) map.set(entry.path, group);
    }
    return map;
  }, [groups]);
  const selectedGroup =
    selectedEntryPath !== null
      ? (groupOfPath.get(selectedEntryPath) ?? null)
      : null;
  const active =
    groups.find((group) => group.id === activeId) ??
    selectedGroup ??
    groups[0] ??
    null;
  const selectedEntry =
    selectedGroup?.entries.find((entry) => entry.path === selectedEntryPath) ??
    null;

  const prefix = useMemo(
    () =>
      active ? sharedPrefix(active.entries.map((entry) => entry.filename)) : "",
    [active],
  );
  const chunks = useMemo(
    () => (active ? chunkEntries(active.entries) : []),
    [active],
  );
  const replacedCount = active
    ? active.entries.filter((entry) => editedPaths.has(entry.path)).length
    : 0;

  const onSelect = useCallback(
    (entry: FoundryEntry) => setSelectedEntryPath(entry.path),
    [setSelectedEntryPath],
  );
  const onToggle = useCallback(
    (entry: FoundryEntry) => {
      setSelectedEntryPath(entry.path);
      player.toggle(entry.path);
    },
    [player, setSelectedEntryPath],
  );
  const onDropFile = useCallback(
    async (entry: FoundryEntry, file: File) => {
      if (!workspace || busy) return;
      if (!SOUND_EXTENSIONS.includes(extensionOf(file.name))) {
        toast.error(t("foundry.sounds.wrongFile"));
        return;
      }
      setSelectedEntryPath(entry.path);
      try {
        await replaceEntry(entry.path, await stageDroppedFile(file));
        toast.success(t("foundry.editor.replaced", { file: entry.filename }));
      } catch (err) {
        logger.withError(err).error("[Foundry] Replace failed");
        toast.error(t("foundry.editor.replaceFailed"));
      }
    },
    [busy, replaceEntry, setSelectedEntryPath, t, workspace],
  );

  if (!active) {
    return (
      <p className='flex-1 px-2 py-6 text-center text-muted-foreground text-sm'>
        {t("foundry.tabs.soundsEmpty")}
      </p>
    );
  }

  const ActiveIcon = KIND_ICONS[active.kind];

  return (
    <>
      <div className={cn(sidePanelClassName, "w-[220px] border-r")}>
        <GroupNav
          activeId={active.id}
          editedPaths={editedPaths}
          groups={groups}
          onSelect={setActiveId}
        />
      </div>
      <div className='flex min-w-0 flex-1 flex-col'>
        <div className='flex shrink-0 items-center gap-3 px-5 pt-[18px] pb-3.5'>
          <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary'>
            {active.slot !== null ? (
              <span className='font-mono font-semibold'>{active.slot}</span>
            ) : (
              <ActiveIcon className='h-5 w-5' />
            )}
          </span>
          <div className='min-w-0 flex-1'>
            <h2 className='truncate font-semibold text-base'>{active.label}</h2>
            <p className='truncate text-muted-foreground text-xs'>
              {[
                active.slot !== null
                  ? t("foundry.sounds.abilitySlot", { slot: active.slot })
                  : null,
                t("foundry.sounds.clipCount", { count: active.entries.length }),
                replacedCount > 0
                  ? t("foundry.sounds.replacedCount", { count: replacedCount })
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
          <button
            className='flex shrink-0 items-center gap-[7px] rounded-[7px] border px-3 py-[7px] font-medium text-xs hover:bg-muted'
            onClick={() => player.playAll(active.entries)}
            type='button'>
            <PlayIcon className='h-[13px] w-[13px]' weight='fill' />
            {t("foundry.sounds.playAll")}
          </button>
        </div>
        <ScrollArea className='min-h-0 flex-1'>
          <div className='space-y-3.5 px-5 pb-5'>
            <div className='space-y-1'>
              {chunks.map((chunk) => (
                <ClipChunk
                  editedPaths={editedPaths}
                  eager={active.entries.length <= EAGER_WAVEFORM_LIMIT}
                  entries={chunk.entries}
                  key={chunk.entries[0].path}
                  onDropFile={onDropFile}
                  onSelect={onSelect}
                  onToggle={onToggle}
                  player={player}
                  prefix={prefix}
                  revision={revision}
                  selectedPath={selectedEntryPath}
                />
              ))}
            </div>
            <p className='flex items-center justify-center gap-2 rounded-lg border border-muted-foreground/30 px-3 py-4 text-muted-foreground text-xs'>
              <WaveformIcon className='h-4 w-4' />
              {t("foundry.sounds.dropHint")}
            </p>
          </div>
        </ScrollArea>
      </div>
      <div className={cn(sidePanelClassName, "w-[292px] border-l")}>
        <ClipInspector
          entry={selectedEntry}
          group={selectedGroup}
          player={player}
          revision={revision}
        />
      </div>
    </>
  );
};
