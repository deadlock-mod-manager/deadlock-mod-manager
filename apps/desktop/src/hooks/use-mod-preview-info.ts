import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { useActiveProfileFolder } from "@/hooks/use-mod-health";
import { resolveModVpk } from "@/lib/foundry";
import { previewAnalysisQueue } from "@/lib/preview-work-queue";
import type { ModPreviewInfo } from "@/types/generated/ModPreviewInfo";
import type { LocalMod } from "@/types/mods";

export const useModPreviewInfo = (
  mod: LocalMod | null,
  enabled = true,
  priority = 1,
) => {
  const profileFolder = useActiveProfileFolder();
  return useQuery({
    queryKey: [
      "mod-preview-info",
      mod?.remoteId,
      mod?.installedVpks,
      mod?.activeVariantArchive,
      mod?.downloadedAt,
      mod?.status,
      profileFolder,
    ],
    queryFn: ({ signal }) =>
      previewAnalysisQueue.run(
        async () => {
          if (!mod) return null;
          const filePath = await resolveModVpk(
            mod.remoteId,
            mod.installedVpks,
            profileFolder,
          );
          signal.throwIfAborted();
          return invoke<ModPreviewInfo>("foundry_mod_preview_info", {
            filePath,
          });
        },
        signal,
        priority,
      ),
    enabled: enabled && mod !== null,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
};
