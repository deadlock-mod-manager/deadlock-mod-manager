import type { ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { queueModDownload } from "@/hooks/use-download";
import { modDownloadsQueryOptions } from "@/hooks/use-mod-downloads";
import type { DeadlockSkinsAlbumMember } from "@/lib/deadlockskins/parse";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import type { ModDownloadItem } from "@/types/mods";

type AlbumDownloadResult = {
  queued: number;
  /** Mods with several files and no usable album pick; the user has to choose. */
  needsFileChoice: string[];
  failed: string[];
};

const fileIdOf = (download: ModDownloadItem) =>
  download.url.slice(download.url.lastIndexOf("/") + 1);

/**
 * The album's own file wins while GameBanana still lists it; otherwise only a
 * single-file mod is unambiguous. Picking a variant for the user could
 * install the wrong one, so those are left for the mod page.
 */
const pickAlbumFile = (files: ModDownloadItem[], albumFileId?: string) =>
  files.find((file) => fileIdOf(file) === albumFileId) ??
  (files.length === 1 ? files[0] : undefined);

type AlbumDownloadInput = {
  mods: ModDto[];
  members: DeadlockSkinsAlbumMember[];
};

export const useAlbumDownload = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState(0);

  const mutation = useMutation({
    mutationFn: async ({
      mods,
      members,
    }: AlbumDownloadInput): Promise<AlbumDownloadResult> => {
      const albumFileIds = new Map(
        members.map((member) => [member.remoteId, member.fileId]),
      );
      const profileFolder =
        usePersistedStore.getState().getActiveProfile()?.folderName ?? null;
      const result: AlbumDownloadResult = {
        queued: 0,
        needsFileChoice: [],
        failed: [],
      };

      setPrepared(0);
      // Sequential: file lists share GameBanana's rate budget with the
      // catalog, and the downloads queue up one after another anyway.
      for (const mod of mods) {
        try {
          const { downloads } = await queryClient.fetchQuery(
            modDownloadsQueryOptions(mod.remoteId),
          );
          const file = pickAlbumFile(downloads, albumFileIds.get(mod.remoteId));
          if (file) {
            queueModDownload(mod, [file], {
              allFiles: downloads,
              profileFolder,
              onError: (error) =>
                toast.error(`Failed to download ${mod.name}: ${error.message}`),
            });
            result.queued += 1;
          } else {
            result.needsFileChoice.push(mod.name);
          }
        } catch (error) {
          logger
            .withMetadata({ mod: mod.remoteId })
            .withError(error)
            .warn("Failed to load album mod files");
          result.failed.push(mod.name);
        }
        setPrepared((count) => count + 1);
      }
      return result;
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: ({ queued, needsFileChoice, failed }) => {
      if (queued > 0) {
        toast.success(t("albums.download.queued", { count: queued }));
      }
      if (needsFileChoice.length > 0) {
        toast.warning(
          t("albums.download.needsFileChoice", {
            count: needsFileChoice.length,
            mods: needsFileChoice.join(", "),
          }),
        );
      }
      if (failed.length > 0) {
        toast.error(
          t("albums.download.failed", {
            count: failed.length,
            mods: failed.join(", "),
          }),
        );
      }
    },
  });

  return { ...mutation, prepared };
};
