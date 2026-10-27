import type { ModdingContentMatch } from "@/types/generated/ModdingContentMatch";

export interface ArchiveContentTarget {
  path: string;
  match: ModdingContentMatch;
}

export function splitContentMatch(text: string, start: number, end: number) {
  const from = Math.min(text.length, Math.max(0, start));
  const to = Math.min(text.length, Math.max(from, end));
  return {
    before: text.slice(0, from),
    match: text.slice(from, to),
    after: text.slice(to),
  };
}

export const CONTENT_SEARCH_RESULT_LIMIT = 2000;

export type ArchiveContentSearchPhase =
  | "idle"
  | "error"
  | "complete"
  | "limit"
  | "paused"
  | "searching";

export function archiveContentSearchPhase({
  submitted,
  paused,
  pending,
  failed,
  hasMore,
  matchingFiles,
}: {
  submitted: boolean;
  paused: boolean;
  pending: boolean;
  failed: boolean;
  hasMore: boolean;
  matchingFiles: number;
}): ArchiveContentSearchPhase {
  if (!submitted) return "idle";
  if (failed) return "error";
  if (
    matchingFiles > CONTENT_SEARCH_RESULT_LIMIT ||
    (matchingFiles === CONTENT_SEARCH_RESULT_LIMIT && hasMore)
  )
    return "limit";
  if (!pending && !hasMore) return "complete";
  return paused ? "paused" : "searching";
}
