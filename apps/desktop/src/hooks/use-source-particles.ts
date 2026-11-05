import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { ParticleModelAsset } from "@/components/foundry/particles/assets";
import { cacheFoundryModel, decodeFoundryModel } from "@/lib/model-assets";
import type { PreviewSource } from "@/lib/preview-animation";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import type { ParticleSourceDraft } from "@/types/generated/ParticleSourceDraft";
import type { ParticleGraphOptions } from "@/types/generated/ParticleGraphOptions";
import logger from "@/lib/logger";
import { useMemo } from "react";
import {
  decodePreviewAnimation,
  listPreviewAnimations,
} from "@/lib/preview-animation";
import { bool, fields, list, str } from "@/components/foundry/particles/values";

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
        textureSide,
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
            textureSide,
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
  const animated = useMemo(
    () =>
      [
        ...new Set(
          Object.values(graph.data?.systems ?? {}).flatMap((system) =>
            list(fields(system).m_Renderers)
              .map(fields)
              .filter((renderer) => bool(renderer.m_bAnimated))
              .flatMap((renderer) =>
                list(renderer.m_ModelList).map((model) =>
                  str(fields(model).m_model),
                ),
              ),
          ),
        ),
      ].filter((path) => paths.includes(path)),
    [graph.data?.systems, paths],
  );
  const animations = useQueries({
    queries: animated.map((path) => ({
      queryKey: [
        "particle-model-animation",
        source.filePath,
        source.overlayRoot,
        source.revision,
        path,
      ],
      queryFn: async () => {
        const model = {
          ...source,
          entryPath: path.endsWith("_c") ? path : `${path}_c`,
        };
        const choices = await listPreviewAnimations(model, [], true);
        const choice = choices[0];
        return choice
          ? {
              path,
              animation: await decodePreviewAnimation(model, choice.clips),
            }
          : { path, animation: null };
      },
      staleTime: 60_000,
      gcTime: 30_000,
      retry: false,
      meta: { skipGlobalErrorHandler: true },
    })),
    combine: (results) =>
      results.flatMap((result) => (result.data ? [result.data] : [])),
  });
  const withAnimations = useMemo(
    () =>
      models.map((model) => ({
        ...model,
        animation:
          animations.find((entry) => entry.path === model.path)?.animation ??
          undefined,
      })),
    [models, animations],
  );
  return { graph, models: withAnimations };
};
