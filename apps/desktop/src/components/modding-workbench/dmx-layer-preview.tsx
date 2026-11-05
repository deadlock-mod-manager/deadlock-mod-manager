import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { FoundryModelViewer } from "@/components/foundry/workbench-model-viewer";
import {
  cacheFoundryModel,
  decodeModdingDmx,
  MODEL_PREVIEW_GC_TIME,
} from "@/lib/model-assets";
import type { ModdingDmxModel } from "@/types/generated/ModdingDmxModel";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import type { ModdingSourceModel } from "@/types/generated/ModdingSourceModel";

interface Props {
  base: ModdingDmxModel;
  addonId: string;
  hierarchy: ModdingHierarchy;
  path: string;
  revision: number;
  fullscreenTarget: RefObject<HTMLDivElement | null>;
}

const combine = (results: UseQueryResult<ModdingDmxModel, Error>[]) => ({
  data: results.map((result) => result.data ?? null),
  loading: results.some((result) => result.isFetching),
  errors: results.flatMap((result) =>
    result.error ? [result.error.message] : [],
  ),
});

export function DmxLayerPreview({
  base,
  addonId,
  hierarchy,
  path,
  revision,
  fullscreenTarget,
}: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [visible, setVisible] = useState(
    () =>
      new Set(
        base.layers
          .filter((layer) => layer.defaultVisible)
          .map((layer) => layer.id),
      ),
  );
  const results = useQueries({
    queries: base.layers.map((layer) => {
      const key = [
        "workbench-dmx-layer",
        addonId,
        hierarchy,
        layer.path,
        revision,
      ];
      return {
        queryKey: key,
        enabled: visible.has(layer.id) && layer.path !== path,
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          const result = await decodeModdingDmx(
            addonId,
            hierarchy,
            layer.path,
            signal,
            false,
          );
          cacheFoundryModel(client, key, result);
          return result;
        },
        staleTime: Infinity,
        gcTime: MODEL_PREVIEW_GC_TIME,
        retry: false,
        meta: { skipGlobalErrorHandler: true },
      };
    }),
    combine,
  });
  const assembled = useMemo<ModdingSourceModel>(
    () => ({
      meshes: base.layers.flatMap((layer, index) => {
        const asset = layer.path === path ? base : results.data[index];
        return asset ? [{ asset, name: layer.id, scale: layer.scale }] : [];
      }),
      diagnostics: [],
    }),
    [base, path, results.data],
  );
  const hidden = useMemo(
    () =>
      new Set(
        base.layers
          .filter((layer) => !visible.has(layer.id))
          .map((layer) => layer.id),
      ),
    [base.layers, visible],
  );
  const toggle = (id: string, enabled: boolean) =>
    setVisible((current) => {
      const next = new Set(current);
      if (enabled) next.add(id);
      else next.delete(id);
      return next;
    });
  const layerRow = (layer: ModdingDmxModel["layers"][number]) => {
    const name = layer.skeleton ? t("workbenchExplorer.dmxBones") : layer.name;
    return (
      <label
        key={layer.id}
        className='flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent'
        title={layer.path}>
        <Checkbox
          aria-label={t("workbenchExplorer.dmxShowLayer", { name })}
          checked={visible.has(layer.id)}
          onCheckedChange={(checked) => toggle(layer.id, checked === true)}
        />
        <span className='min-w-0 truncate text-xs'>{name}</span>
      </label>
    );
  };
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 text-xs'>
        <span
          className='truncate text-muted-foreground'
          title={base.associatedModel ?? undefined}>
          {t("workbenchExplorer.dmxAssembledFrom", {
            name: base.associatedModel?.split("/").at(-1),
          })}
        </span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size='sm'
              variant='outline'
              className='h-7 shrink-0 text-xs'
              aria-label={t("workbenchExplorer.dmxLayers")}>
              {t("workbenchExplorer.dmxLayerCount", { count: visible.size })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-64 p-2'>
            <div className='mb-1 flex items-center justify-between px-2'>
              <span className='text-xs font-medium'>
                {t("workbenchExplorer.dmxLayers")}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='h-6 px-2 text-xs'
                onClick={() =>
                  setVisible(
                    new Set(
                      base.layers
                        .filter((layer) => layer.defaultVisible)
                        .map((layer) => layer.id),
                    ),
                  )
                }>
                {t("workbenchExplorer.dmxResetLayers")}
              </Button>
            </div>
            <div className='max-h-[50vh] overflow-y-auto'>
              {base.layers
                .filter((layer) => layer.defaultVisible || layer.skeleton)
                .map(layerRow)}
              {base.layers.some(
                (layer) => !layer.defaultVisible && !layer.skeleton,
              ) && (
                <details className='mt-1 border-t pt-2'>
                  <summary className='cursor-pointer px-2 py-1 text-xs text-muted-foreground'>
                    {t("workbenchExplorer.dmxOtherLayers")}
                  </summary>
                  {base.layers
                    .filter((layer) => !layer.defaultVisible && !layer.skeleton)
                    .map(layerRow)}
                </details>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className='relative min-h-0 flex-1'>
        {assembled.meshes.length > 0 && (
          <FoundryModelViewer
            model={assembled}
            hiddenSourceLayers={hidden}
            label={path}
            fullscreenTarget={fullscreenTarget}
          />
        )}
        {results.loading && (
          <p
            role='status'
            className='pointer-events-none absolute bottom-3 left-3 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground'>
            {t("workbenchExplorer.dmxLoadingLayers")}
          </p>
        )}
        {visible.size === 0 && (
          <p className='pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground'>
            {t("workbenchExplorer.dmxNoLayers")}
          </p>
        )}
      </div>
      {results.errors.length > 0 && (
        <p role='alert' className='border-t px-3 py-2 text-xs text-destructive'>
          {results.errors.join("; ")}
        </p>
      )}
    </div>
  );
}
