import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { createClothEffect } from "@/lib/cloth-sim";
import {
  decodePreviewAnimation,
  decodePreviewCloth,
  type PreviewSource,
} from "@/lib/preview-animation";
import { useStockModel } from "@/hooks/use-stock-model";
import type { ViewerEffectFactory } from "./viewer-effects";

export const useStockPreview = (
  source: PreviewSource | undefined,
  revision: string | undefined,
  enabled: boolean,
  clips: string[],
  clothOn: boolean,
) => {
  const model = useStockModel(source, revision, enabled);
  const animation = useQuery({
    queryKey: [
      "stock-comparison-animation",
      source?.filePath,
      source?.entryPath,
      revision,
      clips,
    ],
    queryFn: () => (source ? decodePreviewAnimation(source, clips) : null),
    enabled: enabled && !!source && clips.length > 0,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const cloth = useQuery({
    queryKey: [
      "stock-comparison-cloth",
      source?.filePath,
      source?.entryPath,
      revision,
    ],
    queryFn: () => (source ? decodePreviewCloth(source) : null),
    enabled: enabled && !!source && clothOn,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const effects = useMemo<ViewerEffectFactory[]>(
    () => (clothOn && cloth.data ? [createClothEffect(cloth.data)] : []),
    [clothOn, cloth.data],
  );
  return { model, animation, cloth, effects };
};
