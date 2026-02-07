import type { ModDownload } from "@deadlock-mods/database";
import { NSFW_CONTENT_RATINGS, NSFW_KEYWORDS } from "./constants";
import type { GameBanana } from "@deadlock-mods/shared";
import type { GameBananaSubmission } from "./types";

export const parseTags = (
  tags: GameBanana.GameBananaSubmission["_aTags"],
): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) =>
    typeof tag === "string" ? tag : `${tag._sTitle} ${tag._sValue}`,
  );
};

/**
 * Classify if a GameBanana mod contains NSFW content
 * @param mod GameBanana mod submission data
 * @returns boolean indicating if the mod is NSFW
 */
export const classifyNSFW = (
  mod:
    | GameBananaSubmission
    | GameBanana.GameBananaModProfile
    | GameBanana.GameBananaSoundProfile,
): boolean => {
  // Check if mod has extended fields (full mod profile)
  const extendedMod = mod as GameBanana.GameBananaModProfile;

  // 1. Direct flags (authoritative) - check _aContentRatings
  if (extendedMod._aContentRatings) {
    for (const key of Object.keys(extendedMod._aContentRatings)) {
      if (NSFW_CONTENT_RATINGS[key as keyof typeof NSFW_CONTENT_RATINGS]) {
        return true; // Any content rating flag = NSFW
      }
    }
  }

  // 2. Secondary hints (soft indicators)
  let hintScore = 0;

  // Check _sInitialVisibility
  if (extendedMod._sInitialVisibility === "hide") {
    hintScore += 1;
  }

  // Check text content for NSFW keywords
  const hasName = "_sName" in mod;
  const hasTags = "_aTags" in mod;
  const tags = hasTags ? (mod as { _aTags: unknown })._aTags : [];
  const modName = hasName ? (mod as { _sName: string })._sName : "";

  const textContent = [
    modName,
    extendedMod._sDescription || "",
    extendedMod._sText || "",
    ...parseTags(tags as GameBanana.GameBananaSubmission["_aTags"]),
  ]
    .join(" ")
    .toLowerCase();

  const foundKeywords = NSFW_KEYWORDS.filter((keyword) =>
    textContent.includes(keyword.toLowerCase()),
  );

  if (foundKeywords.length > 0) {
    hintScore += 1;
  }

  // Return true if hint score >= 2 (medium confidence threshold)
  return hintScore >= 2;
};

export const buildDownloadSignature = (downloads: ModDownload[]): string => {
  return downloads
    .map(
      (d) =>
        `${d.remoteId}|${d.file}|${d.size}|${d.md5Checksum ?? ""}|${d.createdAt?.getTime()}`,
    )
    .sort()
    .join(";");
};

export const buildDownloadSignatureFromPayload = (
  files: Array<{
    _idRow: number;
    _sFile: string;
    _nFilesize: number;
    _tsDateAdded: number;
    _sMd5Checksum?: string;
  }>,
): string => {
  return files
    .map(
      (f) =>
        `${f._idRow}|${f._sFile}|${f._nFilesize}|${f._sMd5Checksum ?? ""}|${f._tsDateAdded * 1000}`,
    )
    .sort()
    .join(";");
};
