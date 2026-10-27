import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  cacheFoundryModel,
  decodeFoundryModel,
  decodeModdingSourceModel,
  MODEL_PREVIEW_GC_TIME,
} from "@/lib/model-assets";
import { useSourceParticles } from "@/hooks/use-source-particles";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import { PreviewStage } from "./preview-stage";

const NO_EXTRA_ROOTS: string[] = [];

export function AssetThumbnailRenderer({
  addon,
  path,
  revision,
  particle,
  hierarchy,
  onReady,
}: {
  addon: ModdingAddon;
  path: string;
  revision: number;
  particle?: ModdingParticleFile;
  hierarchy: ModdingHierarchy;
  onReady: (image: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<PreviewStage | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const taskKey = `${addon.id}:${hierarchy}:${path}:${revision}`;
  const task = useRef(taskKey);
  task.current = taskKey;
  const client = useQueryClient();
  const entryPath = path.endsWith("_c") ? path : `${path}_c`;
  const isModel = /\.vmdl(_c)?$/i.test(path);
  const sourceModel = hierarchy === "content" && /\.vmdl$/i.test(path);
  const key = [
    sourceModel ? "workbench-source-model" : "workbench-model",
    addon.id,
    sourceModel ? path : entryPath,
    revision,
    false,
  ];
  const model = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = sourceModel
        ? await decodeModdingSourceModel(addon.id, path, signal)
        : await decodeFoundryModel(
            addon.archivePath,
            entryPath,
            null,
            signal,
            addon.gamePath,
          );
      cacheFoundryModel(client, key, result);
      return result;
    },
    enabled: isModel,
    gcTime: MODEL_PREVIEW_GC_TIME,
    staleTime: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const { graph, models } = useSourceParticles(
    {
      filePath: addon.archivePath,
      entryPath,
      overlayRoot: addon.gamePath,
      revision,
    },
    null,
    NO_EXTRA_ROOTS,
    particle
      ? {
          addonId: addon.id,
          version: particle.fingerprint,
          files: [{ path: particle.path, text: particle.text }],
        }
      : undefined,
    256,
    !!path && !isModel,
  );
  useEffect(() => {
    if (!host.current) return;
    const preview = new PreviewStage(host.current, true);
    stage.current = preview;
    return () => {
      stage.current = null;
      preview.dispose();
    };
  }, []);
  useEffect(() => {
    if (stage.current)
      stage.current.callbacks = {
        snapshot: (image) => {
          if (task.current === taskKey) ready.current(image);
        },
      };
    if (isModel && model.data) stage.current?.setModel(model.data);
    else if (!isModel && graph.data)
      stage.current?.setGraph(graph.data, models);
    else stage.current?.clear();
  }, [path, taskKey, isModel, model.data, graph.data, models]);
  const error = isModel ? model.error : graph.error;
  useEffect(() => {
    if (path && error) ready.current(null);
  }, [path, error]);
  return (
    <div
      ref={host}
      aria-hidden
      inert
      className='pointer-events-none fixed -left-[10000px] top-0 h-48 w-64'
    />
  );
}
