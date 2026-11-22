/** How long after an apply the page still treats it as the moment of applying. */
const JUST_APPLIED_MS = 4000;

/**
 * Whether the config was written moments ago, so the apply animations play
 * for a real apply (the first one, a switch or a re-apply) and never when the
 * page simply opens on a config applied earlier.
 */
export const justApplied = (appliedAt: string) =>
  Date.now() - Date.parse(appliedAt) < JUST_APPLIED_MS;
