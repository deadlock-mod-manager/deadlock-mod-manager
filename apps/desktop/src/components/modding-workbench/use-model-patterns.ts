import { useQueries } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import { z } from "zod";
const patternList = z.array(
  z.object({ material: z.string(), style: z.string(), phase: z.number() }),
);
export function useModelPatterns(edits: readonly ModdingModelPartEdit[]) {
  const key = useDebouncedValue(
    JSON.stringify(
      edits
        .filter((e) => e.pattern)
        .map((e) => ({
          material: e.material,
          style: e.pattern?.style,
          phase: e.pattern?.phase,
        })),
    ),
    150,
  );
  const patterns = patternList.parse(JSON.parse(key));
  const results = useQueries({
    queries: patterns.map((p) => ({
      queryKey: ["workbench-model-pattern", p.style, p.phase],
      queryFn: async () => {
        const base64 = await invoke<string>("preview_modding_model_pattern", {
          style: p.style,
          phase: p.phase,
        });
        return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      },
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
      meta: { skipGlobalErrorHandler: true },
    })),
  });
  return {
    previews: new Map(
      patterns.flatMap((p, i) => {
        const data = results[i].data;
        return data ? [[p.material, data] as const] : [];
      }),
    ),
    error: results.find((r) => r.error)?.error,
    pending: results.some((r) => r.isFetching),
  };
}
