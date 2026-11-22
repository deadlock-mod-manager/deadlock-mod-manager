import { RuntimeError } from "@deadlock-mods/common";

export class PermanentIngestionError extends RuntimeError {}

export const isDiskSpaceError = (error: Error): boolean =>
  error.message.includes("ENOSPC") ||
  error.message.includes("No space left on device");
