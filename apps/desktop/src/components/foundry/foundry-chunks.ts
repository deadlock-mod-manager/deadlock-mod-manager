import type { FoundryEntry } from "@/types/foundry";

/** Rows per chunk: the most a single selection or playback change re-renders. */
const CHUNK_SIZE = 100;

export interface EntryChunk {
  entries: FoundryEntry[];
  paths: ReadonlySet<string>;
}

/**
 * Splits a long entry list into fixed-size chunks. A skin holds thousands of
 * files, so the lists render chunk by chunk: a chunk only re-renders when the
 * selection or playback is inside it, and off-screen chunks skip layout and
 * paint via `content-visibility`.
 */
export const chunkEntries = (entries: FoundryEntry[]): EntryChunk[] => {
  const chunks: EntryChunk[] = [];
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const slice = entries.slice(i, i + CHUNK_SIZE);
    chunks.push({
      entries: slice,
      paths: new Set(slice.map((entry) => entry.path)),
    });
  }
  return chunks;
};

/** Style that lets an off-screen chunk keep its height while skipped. */
export const chunkSizeStyle = (rows: number, rowHeightPx: number) => ({
  containIntrinsicSize: `auto ${rows * rowHeightPx}px`,
});
