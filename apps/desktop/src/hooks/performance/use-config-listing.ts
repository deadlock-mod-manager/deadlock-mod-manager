import type { ModDto } from "@deadlock-mods/shared";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getErrorMessage } from "@/lib/errors";
import { gameBananaImportSource } from "@/lib/performance/config-list";
import { configListing } from "@/lib/performance/config-listing";
import { defaultGameBananaFile } from "@/lib/performance/import/gamebanana-link";
import type { PerfImportNavigationState } from "@/lib/performance/import/save";
import { perfQueryKeys } from "@/lib/performance/query-keys";
import type { CatalogDownloadsDto } from "@/types/generated/CatalogDownloadsDto";
import type { ImportSource } from "@/types/generated/ImportSource";
import { usePerfCatalog } from "./use-perf-queries";

type ListedMod = Pick<ModDto, "remoteId" | "category" | "name" | "tags">;

/** Whether a GameBanana listing is a performance config rather than a mod. */
export const useConfigListing = (mod: ListedMod | undefined) => {
  const { data: catalog } = usePerfCatalog();
  const catalogIds = useMemo(
    () =>
      new Set(
        (catalog?.community ?? []).map((config) => String(config.gamebananaId)),
      ),
    [catalog],
  );
  return mod ? configListing(mod, catalogIds) : null;
};

/**
 * Opens the Performance page's import review for a GameBanana config: the
 * catalog's curated file when we list it, otherwise the upload's default file.
 */
export const useOpenConfigInPerformance = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: catalog } = usePerfCatalog();

  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (remoteId: string): Promise<ImportSource> => {
      const listed = catalog?.community.find(
        (config) => String(config.gamebananaId) === remoteId,
      );
      if (listed) return gameBananaImportSource(listed);
      const modId = Number(remoteId);
      const files = await queryClient.fetchQuery({
        queryKey: perfQueryKeys.gameBananaFiles(modId),
        queryFn: () =>
          invoke<CatalogDownloadsDto>("get_gamebanana_submission_files", {
            remoteId,
          }),
        staleTime: 5 * 60 * 1000,
      });
      const fileId = defaultGameBananaFile(files.downloads, null);
      if (fileId === null) throw new Error(t("configListing.noFiles"));
      return { kind: "gameBanana", mod_id: modId, file_id: Number(fileId) };
    },
    onSuccess: (importSource) => {
      const state: PerfImportNavigationState = {
        importSource,
        importContext: null,
      };
      navigate("/performance", { state });
    },
    onError: (error) =>
      toast.error(t("configListing.openFailed"), {
        description: getErrorMessage(error),
      }),
  });
};
