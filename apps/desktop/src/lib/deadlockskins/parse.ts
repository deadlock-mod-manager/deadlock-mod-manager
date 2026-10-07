import { z } from "zod";
import { serializeSubmissionRef } from "@/lib/mods/submission-ref";

export type DeadlockSkinsAlbum = {
  slug: string;
  name: string;
  description: string;
  coverUrl: string | null;
  itemCount: number;
};

export type DeadlockSkinsAlbumMember = {
  /** Catalog slug, the same form `ModDto.remoteId` uses. */
  remoteId: string;
  /** The GameBanana file the album curator picked, when the album names one. */
  fileId?: string;
};

export type DeadlockSkinsAlbumDetail = {
  album: DeadlockSkinsAlbum;
  members: DeadlockSkinsAlbumMember[];
};

// deadlock-mod-manager:https://gamebanana.com/mmdl/<fileId>,<ItemType>,<id>
const DMM_URL_PATTERN =
  /^deadlock-mod-manager:https:\/\/(?:[^/]+\.)?gamebanana\.com\/mmdl\/(\d+),(\w+),(\d+)$/i;

const AlbumSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    coverUrl: z.string().nullish(),
    itemCount: z.number(),
  })
  .transform(
    (album): DeadlockSkinsAlbum => ({
      slug: album.slug,
      name: album.title,
      description: album.description ?? "",
      coverUrl: album.coverUrl ?? null,
      itemCount: album.itemCount,
    }),
  );

const AlbumItemSchema = z.object({
  gameBanana: z
    .object({ type: z.string(), id: z.union([z.number(), z.string()]) })
    .nullish(),
  installUrl: z.string().nullish(),
});

const toSubmissionType = (type: string) => {
  switch (type.toLowerCase()) {
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

/** The curator's file, read from the 1-click link when it points at this submission. */
const fileIdFrom = (
  installUrl: string | null | undefined,
  type: string,
  id: string,
) => {
  const match = installUrl ? DMM_URL_PATTERN.exec(installUrl) : null;
  return match &&
    match[2].toLowerCase() === type.toLowerCase() &&
    match[3] === id
    ? match[1]
    : undefined;
};

/** Maps an album item to its catalog slug, or null if it is not a supported GameBanana submission. */
const toAlbumMember = (
  item: z.infer<typeof AlbumItemSchema>,
): DeadlockSkinsAlbumMember | null => {
  const submissionType = item.gameBanana
    ? toSubmissionType(item.gameBanana.type)
    : null;
  if (!item.gameBanana || !submissionType) return null;
  const submissionId = String(item.gameBanana.id);
  const remoteId = serializeSubmissionRef({
    provider: "gamebanana",
    submissionType,
    submissionId,
  });
  if (!remoteId) return null;
  const fileId = fileIdFrom(
    item.installUrl,
    item.gameBanana.type,
    submissionId,
  );
  return fileId ? { remoteId, fileId } : { remoteId };
};

export const AlbumListResponseSchema = z
  .object({ albums: z.array(AlbumSchema) })
  .transform(({ albums }) => albums);

/** An album with its members in album order, skipping unsupported items. */
export const AlbumDetailResponseSchema = z
  .object({ album: AlbumSchema, items: z.array(AlbumItemSchema) })
  .transform(
    ({ album, items }): DeadlockSkinsAlbumDetail => ({
      album,
      members: items.flatMap((item) => toAlbumMember(item) ?? []),
    }),
  );
