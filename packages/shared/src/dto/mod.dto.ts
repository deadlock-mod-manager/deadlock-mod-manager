import type { Mod, ModDownload } from "@deadlock-mods/database";

export const toModDto = (mod: Mod) => {
  if (!mod.overrides) return mod;

  const { metadata: metadataOverrides, ...fieldOverrides } = mod.overrides;

  return {
    ...mod,
    ...fieldOverrides,
    metadata: metadataOverrides
      ? { ...mod.metadata, ...metadataOverrides }
      : mod.metadata,
  };
};

export const toModDownloadDto = (mod: ModDownload[]) => {
  return mod.map((download) => ({
    url: download.url,
    size: download.size,
    name: download.file,
    description: download.description,
    createdAt: download.createdAt,
    updatedAt: download.updatedAt,
    md5Checksum: download.md5Checksum,
  }));
};

export type ModDto = ReturnType<typeof toModDto>;
export type ModDownloadDto = ReturnType<typeof toModDownloadDto>;
