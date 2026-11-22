const JUST_APPLIED_MS = 4000;

export const justApplied = (appliedAt: string) =>
  Date.now() - Date.parse(appliedAt) < JUST_APPLIED_MS;
