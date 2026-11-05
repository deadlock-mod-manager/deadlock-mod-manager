import { useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import type { ModdingPaintPreview } from "@/types/generated/ModdingPaintPreview";
import type { ModelPaintAnimation } from "@/lib/model-paint-animation";
import type { ModdingModelPaint } from "@/types/generated/ModdingModelPaint";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const modelPaintQuery = (
  addonId: string,
  material: string,
  paint: ModdingModelPaint,
) => ({
  queryKey: ["workbench-model-paint", addonId, material, paint],
  queryFn: async () => {
    const data = await invoke<ModdingPaintPreview>(
      "preview_modding_model_paint",
      {
        addonId,
        material,
        paint,
      },
    );
    return {
      frames: data.frames.map((frame) => ({
        pixels: Uint8Array.from(atob(frame.rgbaBase64), (c) => c.charCodeAt(0)),
        durationMs: frame.durationMs,
      })),
      plays: data.plays,
      frameWidth: data.frameWidth,
      frameHeight: data.frameHeight,
    };
  },
  staleTime: Infinity,
  gcTime: 0,
  retry: false,
  meta: { skipGlobalErrorHandler: true },
});

export function useModelPaint(
  addonId: string,
  edits: readonly ModdingModelPartEdit[],
) {
  const debounced = useDebouncedValue(edits, 150);
  const painted = debounced.filter((e) => e.paint);
  const results = useQueries({
    queries: painted.flatMap((e) =>
      e.paint ? [modelPaintQuery(addonId, e.material, e.paint)] : [],
    ),
  });
  return {
    previews: new Map(
      painted.flatMap((e, i) =>
        results[i].data?.frames[0]
          ? [[e.material, results[i].data.frames[0].pixels] as const]
          : [],
      ),
    ),
    animations: new Map<string, ModelPaintAnimation>(
      painted.flatMap((e, i) =>
        results[i].data ? [[e.material, results[i].data] as const] : [],
      ),
    ),
    error: results.find((r) => r.error)?.error,
  };
}
