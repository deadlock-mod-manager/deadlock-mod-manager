import {
  profileSchema,
  type ModDto,
  type SharedProfile,
} from "@deadlock-mods/shared";
import {
  parseSubmissionSlug,
  serializeSubmissionRef,
} from "@/lib/mods/submission-ref";
import type { AvailableImportedMod } from "@/lib/profiles/types";
import type { LocalMod } from "@/types/mods";

export const sortModsByInstallOrder = (mods: LocalMod[]): LocalMod[] =>
  [...mods].sort(
    (left, right) =>
      (left.installOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.installOrder ?? Number.MAX_SAFE_INTEGER),
  );

export const getProfileModCandidateIds = (
  profile: SharedProfile,
  modIndex: number,
): string[] => {
  const mod = profile.payload.mods[modIndex];
  if (!mod) return [];

  const parsed = parseSubmissionSlug(mod.remoteId);
  if (profile.version === "3") {
    const namespacedMod = profile.payload.mods[modIndex];
    if (!namespacedMod) return [];
    if (parsed?.provider === "local") return [mod.remoteId];

    const submissionId = parsed?.submissionId ?? mod.remoteId;
    const canonical = serializeSubmissionRef({
      provider: "gamebanana",
      submissionType: namespacedMod.submissionType,
      submissionId,
    });
    return canonical ? [canonical] : [];
  }

  if (
    parsed?.provider === "gamebanana" &&
    parsed.submissionType === "mod" &&
    parsed.submissionId === mod.remoteId
  ) {
    return [mod.remoteId, `snd-${mod.remoteId}`];
  }

  return parsed ? [mod.remoteId] : [];
};

const rewriteDownloadIdentity = <
  T extends {
    remoteId: string;
    selectedDownload?: { remoteId: string };
    selectedDownloads?: { remoteId: string }[];
  },
>(
  mod: T,
  remoteId: string,
): T => ({
  ...mod,
  remoteId,
  selectedDownload: mod.selectedDownload
    ? { ...mod.selectedDownload, remoteId }
    : undefined,
  selectedDownloads: mod.selectedDownloads?.map((download) => ({
    ...download,
    remoteId,
  })),
});

export const rewriteProfileIdentities = (
  profile: SharedProfile,
  resolvedIds: readonly string[],
): SharedProfile => {
  if (resolvedIds.length !== profile.payload.mods.length) {
    throw new Error("Every imported profile mod must have a resolved identity");
  }

  const mods = profile.payload.mods.map((mod, index) =>
    rewriteDownloadIdentity(mod, resolvedIds[index] ?? mod.remoteId),
  );
  if (profile.version === "1") {
    return profileSchema.parse({ ...profile, payload: { mods } });
  }

  const identitiesByLegacyId = new Map<string, string[]>();
  profile.payload.mods.forEach((mod, index) => {
    const identities = identitiesByLegacyId.get(mod.remoteId) ?? [];
    identities.push(resolvedIds[index] ?? mod.remoteId);
    identitiesByLegacyId.set(mod.remoteId, identities);
  });
  const usedByLegacyId = new Map<string, number>();
  const loadOrder = profile.payload.loadOrder.map((remoteId) => {
    const identities = identitiesByLegacyId.get(remoteId);
    const used = usedByLegacyId.get(remoteId) ?? 0;
    usedByLegacyId.set(remoteId, used + 1);
    return identities?.[used] ?? identities?.[0] ?? remoteId;
  });

  return profileSchema.parse({ ...profile, payload: { mods, loadOrder } });
};

export const resolveImportContext = (
  importedProfile: SharedProfile,
  modsData: ModDto[],
) => {
  const importedMods = importedProfile.payload.mods;
  const modsDataByRemoteId = new Map(
    modsData.map((mod) => [mod.remoteId, mod]),
  );
  const availableImportedMods = importedMods
    .map((importedMod) => {
      const modData = modsDataByRemoteId.get(importedMod.remoteId);
      return modData ? { importedMod, modData } : null;
    })
    .filter((entry): entry is AvailableImportedMod => entry !== null);

  return {
    importedMods,
    availableImportedMods,
    modsDataByRemoteId,
    unavailableModsCount: importedMods.length - availableImportedMods.length,
  };
};
