import type { CatalogDownloadDto } from "@/types/generated/CatalogDownloadDto";

export type GameBananaLink = {
  modId: number;
  /** Set when the link points at one file (`#FileInfo_<id>` on the download page). */
  fileId: number | null;
};

const GAMEBANANA_HOSTS = new Set(["gamebanana.com", "www.gamebanana.com"]);
const MOD_PATH = /^\/mods\/(?:download\/)?(\d+)\/?$/i;
const FILE_HASH = /^#FileInfo_(\d+)$/i;

/**
 * Reads a GameBanana mod page or download page link, or a bare mod id.
 * `/dl/<fileId>` links are not accepted: they don't name the mod.
 */
export const parseGameBananaLink = (input: string): GameBananaLink | null => {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return { modId: Number(trimmed), fileId: null };

  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }
  if (!GAMEBANANA_HOSTS.has(url.hostname.toLowerCase())) return null;

  const modMatch = url.pathname.match(MOD_PATH);
  if (!modMatch) return null;
  const fileMatch = url.hash.match(FILE_HASH);
  return {
    modId: Number(modMatch[1]),
    fileId: fileMatch ? Number(fileMatch[1]) : null,
  };
};

/** Current files first (newest on top), files the author superseded last. */
export const sortGameBananaFiles = (files: CatalogDownloadDto[]) =>
  [...files].sort((left, right) => {
    if (left.isArchived !== right.isArchived) return left.isArchived ? 1 : -1;
    return (right.createdAt ?? 0) - (left.createdAt ?? 0);
  });

/** The file the link names when the mod still lists it, else the newest current file. */
export const defaultGameBananaFile = (
  files: CatalogDownloadDto[],
  linkedFileId: number | null,
): string | null => {
  const linked =
    linkedFileId === null
      ? undefined
      : files.find((file) => file.fileId === String(linkedFileId));
  return linked?.fileId ?? sortGameBananaFiles(files)[0]?.fileId ?? null;
};
