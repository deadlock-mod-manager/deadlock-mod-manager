import { ProviderError } from "@deadlock-mods/common";
import { gameBananaTimestampToDate } from "./utils";

const DETAIL_CACHE_TTL_MS = 10 * 60 * 1000;

export function indexRevisionToAcknowledge(
  indexModifiedAt: Date | undefined,
  fetchStartedAt: number,
): Date | undefined {
  // Keep recent revisions pending: DownloadPage can lag behind a fresh profile.
  // markSynced preserves the stored revision when this returns undefined.
  if (
    !indexModifiedAt ||
    fetchStartedAt - indexModifiedAt.getTime() < DETAIL_CACHE_TTL_MS
  ) {
    return undefined;
  }
  return indexModifiedAt;
}

export function assertProfileFresh(
  profileModifiedAt: number | undefined,
  indexModifiedAt: number | undefined,
): void {
  const listed = gameBananaTimestampToDate(indexModifiedAt);
  if (!listed) return;

  const profile = gameBananaTimestampToDate(profileModifiedAt);
  if (profile && profile < listed) {
    throw new ProviderError(
      "GameBanana profile is older than its index listing",
    );
  }
}
