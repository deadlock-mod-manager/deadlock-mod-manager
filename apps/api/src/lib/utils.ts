import { createHash } from "node:crypto";
import type { ModDownload, ModOverrides } from "@deadlock-mods/database";
import {
  modDownloadOverridesToDto,
  toModDownloadDto,
} from "@deadlock-mods/shared";
import { env } from "./env";

export const generateHash = (data: string) => {
  return createHash("sha256").update(data).digest("hex");
};

export const formatModDownloads = (
  downloads: ModDownload[],
  modId: string,
  mirroringEnabled: boolean,
  overrides: ModOverrides | null | undefined,
) => {
  if (overrides?.downloads !== undefined) {
    return modDownloadOverridesToDto(overrides.downloads);
  }

  return toModDownloadDto(
    downloads
      .sort((a, b) => b.size - a.size)
      .map((download) => ({
        ...download,
        url: mirroringEnabled
          ? `${env.MIRROR_SERVICE_URL}/download/${modId}/${download.id}`
          : download.url,
      })),
  );
};
