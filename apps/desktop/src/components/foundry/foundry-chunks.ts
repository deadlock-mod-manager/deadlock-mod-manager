import type { FoundryEntry } from "@/types/foundry";

const CHUNK_SIZE = 100;

export interface EntryChunk {
  entries: FoundryEntry[];
  paths: ReadonlySet<string>;
}

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

export const chunkSizeStyle = (rows: number, rowHeightPx: number) => ({
  containIntrinsicSize: `auto ${rows * rowHeightPx}px`,
});
