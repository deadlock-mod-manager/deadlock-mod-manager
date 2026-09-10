import { z } from "zod";
import type { ModDto } from "@deadlock-mods/shared";
import {
  DEADLOCK_GAME_ID,
  GAME_BANANA_BASE_URL,
} from "@/providers/game-banana/constants";

export interface GameBananaIdentity {
  provider: "gamebanana";
  submissionType: "mod" | "sound";
  submissionId: string;
}

export interface GameBananaSubmissionSnapshot {
  identity: GameBananaIdentity;
  slug: string;
  name: string;
  author: string;
  isMap: boolean;
}

export interface DirectGameBananaSubmission extends GameBananaSubmissionSnapshot {
  mod: ModDto;
}

const profileSnapshotSchema = z
  .object({
    _idRow: z.number().int().positive(),
    _sName: z.string().min(1),
    _sProfileUrl: z.string().url().optional(),
    _sText: z.string().optional(),
    _sDescription: z.string().optional(),
    _aSubmitter: z.object({ _sName: z.string().min(1) }),
    _aGame: z.object({ _idRow: z.number().int() }),
    _aSuperCategory: z.object({ _sName: z.string() }).optional(),
    _aRootCategory: z.object({ _sName: z.string() }).optional(),
    _aCategory: z.object({ _sName: z.string() }).optional(),
    _bIsPrivate: z.boolean().optional(),
    _bIsWithheld: z.boolean().optional(),
    _bIsTrashed: z.boolean().optional(),
    _bIsObsolete: z.boolean().optional(),
    _nLikeCount: z.number().int().optional(),
    _nDownloadCount: z.number().int().optional(),
    _tsDateAdded: z.number().int().optional(),
    _tsDateModified: z.number().int().optional(),
    _aFiles: z
      .array(z.object({ _idRow: z.number().int() }).passthrough())
      .optional(),
    _aPreviewMedia: z
      .object({
        _aImages: z
          .array(z.object({ _sBaseUrl: z.string(), _sFile: z.string() }))
          .optional(),
        _aMetadata: z
          .object({ _sAudioUrl: z.string().url().optional() })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const parseGameBananaSlug = (
  slug: string,
): GameBananaIdentity | null => {
  const match = /^(snd-)?([1-9]\d*)$/.exec(slug.trim());
  if (!match?.[2]) return null;
  return {
    provider: "gamebanana",
    submissionType: match[1] ? "sound" : "mod",
    submissionId: match[2],
  };
};

export const gameBananaIdentitySlug = (identity: GameBananaIdentity): string =>
  identity.submissionType === "sound"
    ? `snd-${identity.submissionId}`
    : identity.submissionId;

export const fetchGameBananaSubmission = async (
  identity: GameBananaIdentity,
  fetcher: typeof fetch = fetch,
): Promise<DirectGameBananaSubmission | null> => {
  const model = identity.submissionType === "sound" ? "Sound" : "Mod";
  const response = await fetcher(
    `${GAME_BANANA_BASE_URL}/${model}/${identity.submissionId}/ProfilePage`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GameBanana profile request failed (${response.status})`);
  }

  const result = profileSnapshotSchema.safeParse(await response.json());
  if (!result.success) return null;
  const profile = result.data;
  if (
    profile._idRow.toString() !== identity.submissionId ||
    profile._aGame._idRow !== DEADLOCK_GAME_ID ||
    profile._bIsPrivate === true ||
    profile._bIsWithheld === true ||
    profile._bIsTrashed === true
  ) {
    return null;
  }
  const category =
    profile._aSuperCategory?._sName ||
    profile._aRootCategory?._sName ||
    profile._aCategory?._sName ||
    "Other";
  const slug = gameBananaIdentitySlug(identity);
  const addedAt = new Date((profile._tsDateAdded ?? 0) * 1_000);
  const updatedAt = new Date(
    (profile._tsDateModified ?? profile._tsDateAdded ?? 0) * 1_000,
  );
  const isMap = identity.submissionType === "mod" && category === "Maps";
  const snapshot = {
    identity,
    slug,
    name: profile._sName,
    author: profile._aSubmitter._sName,
    isMap,
  };
  return {
    ...snapshot,
    mod: {
      id: slug,
      remoteId: slug,
      name: snapshot.name,
      description: profile._sText || profile._sDescription || null,
      remoteUrl:
        profile._sProfileUrl ??
        `https://gamebanana.com/${identity.submissionType === "sound" ? "sounds" : "mods"}/${identity.submissionId}`,
      category,
      likes: profile._nLikeCount ?? 0,
      author: snapshot.author,
      downloadable: (profile._aFiles?.length ?? 0) > 0,
      remoteAddedAt: addedAt,
      remoteUpdatedAt: updatedAt,
      tags: [],
      images:
        profile._aPreviewMedia?._aImages?.map(
          (image) => `${image._sBaseUrl}/${image._sFile}`,
        ) ?? [],
      hero: null,
      isAudio: identity.submissionType === "sound",
      isMap,
      audioUrl: profile._aPreviewMedia?._aMetadata?._sAudioUrl ?? null,
      downloadCount: profile._nDownloadCount ?? 0,
      isNSFW: false,
      isObsolete: profile._bIsObsolete ?? false,
      isBlacklisted: false,
      blacklistReason: null,
      blacklistedAt: null,
      blacklistedBy: null,
      filesUpdatedAt: updatedAt,
      metadata: null,
      dependencies: [],
      overrides: null,
      createdAt: null,
      updatedAt: null,
    },
  };
};

export const fetchGameBananaSubmissionSnapshot = async (
  identity: GameBananaIdentity,
  fetcher: typeof fetch = fetch,
): Promise<GameBananaSubmissionSnapshot | null> => {
  const submission = await fetchGameBananaSubmission(identity, fetcher);
  if (!submission) return null;
  const { mod: _mod, ...snapshot } = submission;
  return snapshot;
};
