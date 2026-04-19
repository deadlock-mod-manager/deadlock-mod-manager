import type { Mod, ModDownload } from "@deadlock-mods/database";

export const toModDto = (mod: Mod) => {
  if (!mod.overrides) return mod;

  const {
    metadata: metadataOverrides,
    downloads: _downloadOverrides,
    ...fieldOverrides
  } = mod.overrides;

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

export const modDownloadOverridesToDto = (
  downloads: ReadonlyArray<{ url: string; file: string }>,
) => {
  return downloads.map((download) => ({
    url: download.url,
    size: 0,
    name: download.file,
    description: null,
    createdAt: null,
    updatedAt: null,
    md5Checksum: null,
  }));
};

export type ModDto = Omit<ReturnType<typeof toModDto>, "isTrashed">;
export type ModDownloadDto = ReturnType<typeof toModDownloadDto>;
