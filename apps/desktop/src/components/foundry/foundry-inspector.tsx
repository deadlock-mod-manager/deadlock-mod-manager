import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { SlidersIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { formatBytes } from "./foundry-entry-list";

const allEntries = (
  m: NonNullable<ReturnType<typeof useFoundry>["manifest"]>,
) => [
  ...m.models,
  ...m.materials,
  ...m.textures,
  ...m.cards,
  ...m.particles,
  ...m.sounds,
  ...m.other,
];

/**
 * Right-hand properties panel. Shows details for the selected entry and hosts
 * the per-tab editing controls (recolor, card upload, sound picker) as they land.
 */
export const FoundryInspector = () => {
  const { t } = useTranslation();
  const { manifest, activeTab, selectedEntryPath, texturePreview } =
    useFoundry();

  const selected = useMemo<FoundryEntry | null>(() => {
    if (!manifest || !selectedEntryPath) return null;
    return (
      allEntries(manifest).find((e) => e.path === selectedEntryPath) ?? null
    );
  }, [manifest, selectedEntryPath]);

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-4 p-4'>
        <div className='flex items-center gap-2 text-muted-foreground'>
          <SlidersIcon className='h-4 w-4' weight='duotone' />
          <span className='font-medium text-sm'>
            {t("foundry.inspector.title")}
          </span>
        </div>

        {selected ? (
          <dl className='space-y-2 text-sm'>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {t("foundry.inspector.file")}
              </dt>
              <dd className='break-all font-medium'>{selected.filename}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {t("foundry.inspector.path")}
              </dt>
              <dd className='break-all font-mono text-xs'>{selected.path}</dd>
            </div>
            <div className='flex gap-6'>
              <div>
                <dt className='text-muted-foreground text-xs'>
                  {t("foundry.inspector.type")}
                </dt>
                <dd className='font-medium'>{selected.ext}</dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>
                  {t("foundry.inspector.size")}
                </dt>
                <dd className='font-medium'>{formatBytes(selected.size)}</dd>
              </div>
            </div>
            {texturePreview.status === "ready" &&
              texturePreview.width &&
              texturePreview.height && (
                <div>
                  <dt className='text-muted-foreground text-xs'>
                    {t("foundry.inspector.dimensions")}
                  </dt>
                  <dd className='font-medium'>
                    {texturePreview.width} × {texturePreview.height}
                  </dd>
                </div>
              )}
          </dl>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t("foundry.inspector.noSelection")}
          </p>
        )}

        <div className='rounded-md border border-dashed p-3'>
          <p className='text-muted-foreground text-xs'>
            {t(`foundry.inspector.${activeTab}Soon`)}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
};
