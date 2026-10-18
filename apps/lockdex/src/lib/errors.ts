import { RuntimeError } from "@deadlock-mods/common";

/**
 * This file version can never be indexed (gone upstream, too large, corrupt),
 * so retrying it or queueing it again is wasted work.
 */
export class PermanentIngestionError extends RuntimeError {}

export const isDiskSpaceError = (error: Error): boolean =>
  error.message.includes("ENOSPC") ||
  error.message.includes("No space left on device");
