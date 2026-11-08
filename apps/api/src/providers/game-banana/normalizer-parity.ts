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

type ProfileCategory = Pick<
  GameBanana.GameBananaModProfile["_aCategory"],
  "_sName"
> &
  Partial<
    Pick<
      GameBanana.GameBananaModProfile["_aCategory"],
      "_idRow" | "_sProfileUrl"
    >
  >;

type RetainedCategory = {
  key: string;
  name: string;
};

// GameBanana omits the id for this root; the desktop catalog pins it.
const MODEL_REPLACEMENT_ID = 33154;
const CATEGORY_URL_ID = /\/cats\/(\d+)\/?$/;

function categoryId(
  category: ProfileCategory,
  submissionType: "mod" | "sound",
): number | null {
  if (category._idRow !== undefined && category._idRow > 0)
    return category._idRow;
  const fromUrl = Number(category._sProfileUrl?.match(CATEGORY_URL_ID)?.[1]);
  if (fromUrl > 0) return fromUrl;
  return submissionType === "mod" &&
    category._sName.trim() === "Model Replacement"
    ? MODEL_REPLACEMENT_ID
    : null;
}

/** Mirrors `category_path` in the desktop GameBanana catalog. */
function retainedCategoryPath(
  categories: Array<ProfileCategory | undefined>,
  submissionType: "mod" | "sound",
): RetainedCategory[] {
  const path: RetainedCategory[] = [];
  for (const category of categories) {
    if (!category) continue;
    const id = categoryId(category, submissionType);
    const name = category._sName.trim();
    const key = `${submissionType}:${id}`;
    if (id !== null && name && !path.some((entry) => entry.key === key)) {
      path.push({ key, name });
    }
  }
  return path;
}

export type RetainedNormalizedSubmission = {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  categoryPath: RetainedCategory[];
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
    categoryPath: retainedCategoryPath(
      [profile._aRootCategory, profile._aSuperCategory, profile._aCategory],
      submissionType,
    ),
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
