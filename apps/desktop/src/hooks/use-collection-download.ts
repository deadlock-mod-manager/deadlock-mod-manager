import type { ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { queueModDownload } from "@/hooks/use-download";
import { modDownloadsQueryOptions } from "@/hooks/use-mod-downloads";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

type CollectionDownloadResult = {
  queued: number;
  /** Mods with several files; the user has to choose one on the mod page. */
  needsFileChoice: string[];
  failed: string[];
};

export const useCollectionDownload = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [prepared, setPrepared] = useState(0);

  const mutation = useMutation({
    mutationFn: async (mods: ModDto[]): Promise<CollectionDownloadResult> => {
      const profileFolder =
        usePersistedStore.getState().getActiveProfile()?.folderName ?? null;
      const result: CollectionDownloadResult = {
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
          // Picking a variant for the user could install the wrong one.
          const file = downloads.length === 1 ? downloads[0] : undefined;
          if (file) {
            queueModDownload(mod, [file], {
              allFiles: downloads,
              profileFolder,
              analyticsEntryPoint: "collection",
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
            .warn("Failed to load collection mod files");
          result.failed.push(mod.name);
        }
        setPrepared((count) => count + 1);
      }
      return result;
    },
    meta: { skipGlobalErrorHandler: true },
    onSuccess: ({ queued, needsFileChoice, failed }) => {
      if (queued > 0) {
        toast.success(t("collections.download.queued", { count: queued }));
      }
      if (needsFileChoice.length > 0) {
        toast.warning(
          t("collections.download.needsFileChoice", {
            count: needsFileChoice.length,
            mods: needsFileChoice.join(", "),
          }),
        );
      }
      if (failed.length > 0) {
        toast.error(
          t("collections.download.failed", {
            count: failed.length,
            mods: failed.join(", "),
          }),
        );
      }
    },
  });

  return { ...mutation, prepared };
};
