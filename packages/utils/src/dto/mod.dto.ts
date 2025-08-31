import type { Mod, ModDownload } from '@deadlock-mods/database';

export const toModDto = (mod: Mod) => {
  return mod;
};
export const toModDownloadDto = (mod: ModDownload[]) => {
  return mod.map((download) => ({
    url: download.url,
    size: download.size,
    name: download.file,
  }));
};

export type ModDto = ReturnType<typeof toModDto>;
export type ModDownloadDto = ReturnType<typeof toModDownloadDto>;
