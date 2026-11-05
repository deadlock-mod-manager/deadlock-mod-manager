import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FoundryModelViewer } from "@/components/foundry/workbench-model-viewer";
import { cacheFoundryModel, decodeModdingDmx } from "@/lib/model-assets";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { DmxLayerPreview } from "./dmx-layer-preview";

interface Props {
  addonId: string;
  hierarchy: ModdingHierarchy;
  path: string;
  revision: number;
}

export const AddonDmxPreview = ({ revision, ...file }: Props) => {
  const { t } = useTranslation();
  const client = useQueryClient();
  const fullscreen = useRef<HTMLDivElement>(null);
  const key = [
    "workbench-dmx",
    file.addonId,
    file.hierarchy,
    file.path,
    revision,
  ];
  const model = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = await decodeModdingDmx(
        file.addonId,
        file.hierarchy,
        file.path,
        signal,
      );
      cacheFoundryModel(client, key, result);
      return result;
    },
    gcTime: 0,
    staleTime: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const error = model.error;
  return (
    <div ref={fullscreen} className='flex h-full min-h-0 flex-col'>
      {model.data?.skeletonOnly && !model.data.layers?.length && (
        <div role='note' className='border-b bg-muted/30 px-3 py-2 text-xs'>
          <p className='font-medium'>
            {t("workbenchExplorer.dmxSkeletonTitle")}
          </p>
          <p className='mt-1 text-muted-foreground'>
            {t("workbenchExplorer.dmxSkeletonDescription")}
          </p>
        </div>
      )}
      <div className='min-h-0 flex-1'>
        {model.data?.layers?.length ? (
          <DmxLayerPreview
            key={`${file.addonId}:${file.hierarchy}:${file.path}:${revision}`}
            base={model.data}
            {...file}
            revision={revision}
            fullscreenTarget={fullscreen}
          />
        ) : model.data ? (
          <FoundryModelViewer
            model={model.data}
            label={file.path}
            fullscreenTarget={fullscreen}
          />
        ) : (
          <p
            role={error ? "alert" : "status"}
            className='p-4 text-sm text-muted-foreground'>
            {error?.message ?? t("workbenchExplorer.readingDmx")}
          </p>
        )}
      </div>
      <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
        {t("workbenchExplorer.dmxPreviewDescription")}
      </p>
    </div>
  );
};
