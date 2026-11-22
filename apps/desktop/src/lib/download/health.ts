import type { ModProgress } from "@/lib/store/slices/mods";

/** Below this rate a download counts as slow. */
const SLOW_BYTES_PER_SECOND = 150 * 1024;
/** Below this rate the server has effectively stopped sending. */
const STALLED_BYTES_PER_SECOND = 1024;
/** How long a download stays slow before the user is told why. */
const NOTICE_DELAY_MS = 8_000;
/** A download this close to done finishes before an explanation helps. */
const NEARLY_DONE_PERCENTAGE = 97;

export type DownloadHealth = "ok" | "slow" | "stalled";

/** When the download first dropped below the slow rate, kept until it recovers. */
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
