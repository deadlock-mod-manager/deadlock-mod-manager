import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { ParticleModelAsset } from "@/components/foundry/particles/assets";
import { cacheFoundryModel, decodeFoundryModel } from "@/lib/model-assets";
import type { PreviewSource } from "@/lib/preview-animation";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ParticleSourceDraft } from "@/types/generated/ParticleSourceDraft";

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
    ],
    queryFn: () =>
      invoke<FoundryParticleGraph>("foundry_particle_graph", {
        filePath: source.filePath,
        entryPath: source.entryPath,
        overlayRoot: source.overlayRoot,
        roots: [],
        abilityName,
        options: {
          additionalRoots,
          sourceAddonId: drafts?.addonId,
          sourceFiles: drafts?.files ?? [],
        },
      }),
    enabled: /\.(vmdl|vpcf)_c$/.test(source.entryPath),
    placeholderData: drafts ? undefined : (previous) => previous,
    staleTime: 60_000,
    gcTime: 30_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const paths = graph.data?.models ?? [];
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
