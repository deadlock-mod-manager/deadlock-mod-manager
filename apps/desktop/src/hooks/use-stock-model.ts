import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cacheFoundryModel, decodeFoundryModel } from "@/lib/model-assets";
import type { PreviewSource } from "@/lib/preview-animation";

export const useStockModel = (
  source: PreviewSource | undefined,
  revision: string | undefined,
  enabled: boolean,
) => {
  const client = useQueryClient();
  const queryKey = [
    "stock-comparison-model",
    source?.filePath,
    source?.entryPath,
    revision,
  ];
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!source) return null;
      const model = await decodeFoundryModel(
        source.filePath,
        source.entryPath,
        null,
        signal,
      );
      cacheFoundryModel(client, queryKey, model);
      return model;
    },
    enabled: enabled && !!source,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
};
