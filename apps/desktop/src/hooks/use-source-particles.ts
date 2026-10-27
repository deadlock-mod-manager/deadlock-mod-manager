import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { ParticleModelAsset } from "@/components/foundry/particles/assets";
import { cacheFoundryModel, decodeFoundryModel } from "@/lib/model-assets";
import type { PreviewSource } from "@/lib/preview-animation";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ParticleSourceDraft } from "@/types/generated/ParticleSourceDraft";
import type { ParticleGraphOptions } from "@/types/generated/ParticleGraphOptions";
import logger from "@/lib/logger";

export interface ParticleDraftSources {
  addonId: string;
  files: ParticleSourceDraft[];
  version: string;
}

export const useSourceParticles = (
  source: PreviewSource,
  abilityName: string | null,
  additionalRoots: string[],
  drafts?: ParticleDraftSources,
  textureSide = 1024,
  enabled = true,
) => {
  const client = useQueryClient();
  const graph = useQuery({
    queryKey: [
      "source-particle-graph",
      source.filePath,
      source.entryPath,
      source.overlayRoot,
      source.revision,
      abilityName,
      additionalRoots,
      drafts?.addonId,
      drafts?.version,
      textureSide,
    ],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      const requestId = crypto.randomUUID();
      const cancel = () => {
        void invoke("foundry_cancel_model_decode", { requestId }).catch(
          (error) => {
            logger
              .withError(error)
              .warn("[Workbench] Could not cancel particle graph");
          },
        );
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const graph = await invoke<FoundryParticleGraph>(
          "foundry_particle_graph",
          {
            filePath: source.filePath,
            entryPath: source.entryPath,
            overlayRoot: source.overlayRoot,
            roots: [],
            abilityName,
            options: {
              requestId,
              textureSide,
              additionalRoots,
              sourceAddonId: drafts?.addonId ?? null,
              sourceFiles: drafts?.files ?? [],
            } satisfies ParticleGraphOptions,
          },
        );
        signal.throwIfAborted();
        return graph;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
    enabled: enabled && /\.(vmdl|vpcf)_c$/.test(source.entryPath),
    placeholderData:
      drafts || textureSide < 1024 ? undefined : (previous) => previous,
    staleTime: 60_000,
    gcTime: drafts ? 0 : 30_000,
    retry: false,
    meta: {
      skipGlobalErrorHandler: true,
      foregroundPreview: enabled && textureSide >= 1024,
    },
  });
  const paths = enabled ? (graph.data?.models ?? []) : [];
  const models = useQueries({
    queries: paths.map((path) => {
      const key = [
        "source-particle-model",
        source.filePath,
        source.overlayRoot,
        source.revision,
        path,
      ];
      return {
        queryKey: key,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const model = await decodeFoundryModel(
            source.filePath,
            path.endsWith("_c") ? path : `${path}_c`,
            null,
            signal,
            source.overlayRoot,
          );
          cacheFoundryModel(client, key, model);
          return model;
        },
        staleTime: 60_000,
        gcTime: 30_000,
        retry: false,
        meta: { skipGlobalErrorHandler: true },
      };
    }),
    combine: (results): ParticleModelAsset[] =>
      results.flatMap((result, index) => {
        const path = paths[index];
        return result.data && path ? [{ path, asset: result.data }] : [];
      }),
  });
  return { graph, models };
};
