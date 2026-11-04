import {
  ChatCircleIcon,
  CrosshairIcon,
  FileCodeIcon,
  FolderIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { FoundrySoundGroupKind } from "@/types/foundry";

/** Audio the backend can mint into a `.vsnd_c`, plus the compiled form itself. */
export const SOUND_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "vsnd_c"];

/** The in-game volume range, in dB. Cuts go further than boosts, which clip. */
export const GAIN_MIN_DB = -24;

export const GAIN_MAX_DB = 12;

/** Groups this small decode every clip's waveform up front. */
export const EAGER_WAVEFORM_LIMIT = 40;

export const KIND_ICONS = {
  ability: WaveformIcon,
  voice: ChatCircleIcon,
  weapon: CrosshairIcon,
  soundevents: FileCodeIcon,
  other: FolderIcon,
} satisfies Record<FoundrySoundGroupKind, React.ElementType>;

export const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
};

/** Words shared by every clip in a group, so rows can show what differs. */
export const sharedPrefix = (names: string[]): string => {
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

export const clipName = (filename: string, prefix: string) => {
  const rest = filename.startsWith(prefix)
    ? filename.slice(prefix.length)
    : filename;
  const words = (rest || filename).replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
