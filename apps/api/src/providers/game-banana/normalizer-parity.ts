import type { DeadlockHeroes, GameBanana } from "@deadlock-mods/shared";
import {
  categoryFromGameBananaProfile,
  classifyNSFW,
  heroFromGameBananaProfile,
  resolveRemoteTimestamps,
  submitterDisplayName,
} from "./utils";

type Profile =
  | GameBanana.GameBananaModProfile
  | GameBanana.GameBananaSoundProfile;

export type RetainedNormalizedSubmission = {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  hero: DeadlockHeroes | null;
  downloadCount: number;
  likes: number;
  isAudio: boolean;
  isMap: boolean;
  isNsfw: boolean;
  isObsolete: boolean;
  remoteAddedAt: number;
  remoteUpdatedAt: number;
};

/**
 * Projects the fields retained by the desktop catalog using the API's current
 * normalization helpers. The fixture test and Rust normalizer share one oracle,
 * making intentional behavior changes visible on both sides of the migration.
 */
export function normalizeRetainedProfile(
  profile: Profile,
  submissionType: "mod" | "sound",
): RetainedNormalizedSubmission {
  const isAudio = submissionType === "sound";
  const category = categoryFromGameBananaProfile(profile);
  const timestamps = resolveRemoteTimestamps(
    profile._tsDateAdded,
    profile._tsDateModified,
  );

  return {
    slug: isAudio ? `snd-${profile._idRow}` : profile._idRow.toString(),
    name: profile._sName,
    description: profile._sText || profile._sDescription || "",
    author: submitterDisplayName(profile),
    category,
    hero: heroFromGameBananaProfile(profile),
    downloadCount: profile._nDownloadCount ?? 0,
    likes: profile._nLikeCount ?? 0,
    isAudio,
    isMap: !isAudio && category === "Maps",
    isNsfw: classifyNSFW(profile),
    isObsolete: profile._bIsObsolete ?? false,
    remoteAddedAt: timestamps.remoteAddedAt.getTime() / 1_000,
    remoteUpdatedAt: timestamps.remoteUpdatedAt.getTime() / 1_000,
  };
}
