import { createHash } from "node:crypto";
import type { ModDownload } from "@deadlock-mods/database";
import { toModDownloadDto } from "@deadlock-mods/shared";
import { env } from "./env";

export const generateHash = (data: string) => {
  return createHash("sha256").update(data).digest("hex");
};

export const formatModDownloads = (
  downloads: ModDownload[],
  modId: string,
  mirroringEnabled: boolean,
) => {
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
