import { memo } from "react";
import type { FoundryEntry } from "@/types/foundry";
import { chunkSizeStyle } from "./foundry-chunks";
import { type SoundPlayer } from "./use-foundry-sound-player";
import { ClipRow } from "./foundry-sound-clip-row";
import { clipName } from "./foundry-sound-utils";

export const ClipChunk = memo(function ClipChunk({
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
