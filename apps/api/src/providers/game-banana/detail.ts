import { ProviderError } from "@deadlock-mods/common";
import { GAME_BANANA_BASE_URL } from "./constants";
import { gameBananaTimestampToDate } from "./utils";

export function fetchDetailPage(
  remoteId: string,
  modType: "Mod" | "Sound",
  page: "ProfilePage" | "DownloadPage",
  indexModifiedAt?: number,
): Promise<Response> {
  const url = new URL(`${GAME_BANANA_BASE_URL}/${modType}/${remoteId}/${page}`);
  // Detail pages can remain cached after the uncached index reports an edit.
  if (gameBananaTimestampToDate(indexModifiedAt)) {
    url.searchParams.set("_v", String(indexModifiedAt));
  }
  return fetch(url.toString());
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
