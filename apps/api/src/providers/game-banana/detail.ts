import { gameBananaTimestampToDate } from "./utils";

const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;

export function indexRevisionToAcknowledge(
  indexModifiedAt: Date | undefined,
  fetchStartedAt: number,
): Date | undefined {
  if (
    !indexModifiedAt ||
    fetchStartedAt - indexModifiedAt.getTime() < DETAIL_CACHE_TTL_MS
  ) {
    return undefined;
  }
  return indexModifiedAt;
}

export function isProfileStale(
  profileModifiedAt: number | undefined,
  indexModifiedAt: number | undefined,
): boolean {
  const listed = gameBananaTimestampToDate(indexModifiedAt);
  if (!listed) return false;

  const profile = gameBananaTimestampToDate(profileModifiedAt);
  return profile !== null && profile < listed;
}
