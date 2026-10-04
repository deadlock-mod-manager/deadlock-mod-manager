import { z } from "zod";
import { serializeSubmissionRef } from "@/lib/mods/submission-ref";
import type { SubmissionType } from "@/types/generated/SubmissionType";

export type DeadlockSkinsAlbumMember = {
  /** Catalog slug, the same form `ModDto.remoteId` uses. */
  remoteId: string;
  /** The GameBanana file the album curator picked for this mod. */
  fileId: string;
};

// deadlock-mod-manager:https://gamebanana.com/mmdl/<fileId>,<ItemType>,<id>
const DMM_URL_PATTERN =
  /^deadlock-mod-manager:https:\/\/(?:[^/]+\.)?gamebanana\.com\/mmdl\/(\d+),(\w+),(\d+)$/i;

const AlbumMembersSchema = z.array(z.object({ dmmUrl: z.string() }));

const toSubmissionType = (itemType: string): SubmissionType | null => {
  switch (itemType.toLowerCase()) {
    case "mod":
      return "mod";
    case "sound":
      return "sound";
    case "wip":
      return "wip";
    default:
      return null;
  }
};

/** Splits a 1-click link into its catalog slug and file, or null if unsupported. */
export const parseDmmUrl = (
  dmmUrl: string,
): DeadlockSkinsAlbumMember | null => {
  const match = DMM_URL_PATTERN.exec(dmmUrl);
  const submissionType = match ? toSubmissionType(match[2]) : null;
  if (!match || !submissionType) return null;
  const remoteId = serializeSubmissionRef({
    provider: "gamebanana",
    submissionType,
    submissionId: match[3],
  });
  return remoteId ? { remoteId, fileId: match[1] } : null;
};

/** Reads the `data-members` JSON of an album page, skipping unsupported links. */
export const parseAlbumMembers = (json: string): DeadlockSkinsAlbumMember[] =>
  AlbumMembersSchema.parse(JSON.parse(json)).flatMap(
    ({ dmmUrl }) => parseDmmUrl(dmmUrl) ?? [],
  );
