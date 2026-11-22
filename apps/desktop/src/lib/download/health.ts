import type { ModProgress } from "@/lib/store/slices/mods";

const SLOW_BYTES_PER_SECOND = 150 * 1024;
const STALLED_BYTES_PER_SECOND = 1024;
const NOTICE_DELAY_MS = 8_000;
const NEARLY_DONE_PERCENTAGE = 97;

export type DownloadHealth = "ok" | "slow" | "stalled";

export const nextSlowSince = (
  previous: number | undefined,
  speed: number,
  now: number,
) => (speed < SLOW_BYTES_PER_SECOND ? (previous ?? now) : undefined);

export const getDownloadHealth = (
  progress: ModProgress | undefined,
  now: number,
): DownloadHealth => {
  if (
    progress?.slowSince === undefined ||
    progress.percentage >= NEARLY_DONE_PERCENTAGE ||
    now - progress.slowSince < NOTICE_DELAY_MS
  ) {
    return "ok";
  }
  return (progress.speed ?? 0) < STALLED_BYTES_PER_SECOND ? "stalled" : "slow";
};
