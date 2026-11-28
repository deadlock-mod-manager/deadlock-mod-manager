import { createHash } from "node:crypto";
import type { ModDownload, ModOverrides } from "@deadlock-mods/database";
import {
  modDownloadOverridesToDto,
  toModDownloadDto,
} from "@deadlock-mods/shared";

export const generateHash = (data: string) => {
  return createHash("sha256").update(data).digest("hex");
};

export const formatModDownloads = (
  downloads: ModDownload[],
  overrides: ModOverrides | null | undefined,
) => {
  if (overrides?.downloads !== undefined) {
    return modDownloadOverridesToDto(overrides.downloads);
  }

  return toModDownloadDto(
    downloads.sort((a, b) => a.position - b.position || b.size - a.size),
  );
};
