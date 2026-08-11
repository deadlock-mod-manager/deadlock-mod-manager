import { Badge } from "@deadlock-mods/ui/components/badge";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { SlidersIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry, FoundryManifest } from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryEditorControls } from "./foundry-editor-controls";
import { formatBytes } from "./foundry-entry-list";

const allEntries = (manifest: FoundryManifest): FoundryEntry[] => [
  ...manifest.models,
  ...manifest.materials,
  ...manifest.textures,
  ...manifest.cards,
  ...manifest.sounds,
  ...manifest.other,
];

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='font-medium'>{children}</dd>
  </div>
);

/**
 * Right-hand properties panel: details for the selected entry, plus the editing
 * controls that act on it (recolor, replace, revert).
 */
export const FoundryInspector = () => {
  const { t } = useTranslation();
  const {
    manifest,
    activeTab,
    selectedEntryPath,
    modelPreview,
    texturePreview,
    cardPreviews,
    editedPaths,
    primaryModelPath,
  } = useFoundry();

  const selected = useMemo<FoundryEntry | null>(() => {
    if (!manifest || !selectedEntryPath) return null;
    const known = allEntries(manifest).find(
      (entry) => entry.path === selectedEntryPath,
    );
    if (known) return known;

    // A base-game card the mod doesn't override isn't in the manifest, but the
    // user can still replace it — the export then adds that card to the skin.
    const card = cardPreviews.defaultCards.find(
      (preview) => preview.path === selectedEntryPath,
    );
    if (!card) return null;
    return {
      path: card.path,
      filename: card.filename,
      ext: "vtex_c",
      size: 0,
      category: "card",
      source: "default",
    };
  }, [manifest, selectedEntryPath, cardPreviews.defaultCards]);

  // The paint tab works on whole parts of the hero, not on the selected file, so
  // a per-entry properties panel there would only be noise.
  if (activeTab === "paint") {
    return null;
  }

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
          <>
            <dl className='space-y-2 text-sm'>
              <div>
                <dt className='text-muted-foreground text-xs'>
                  {t("foundry.inspector.file")}
                </dt>
                <dd className='flex items-start gap-2'>
                  <span className='min-w-0 break-all font-medium'>
                    {selected.filename}
                  </span>
                  {primaryModelPath === selected.path && (
                    <Badge className='shrink-0 text-[10px]' variant='secondary'>
                      {t("foundry.primary")}
                    </Badge>
                  )}
                  {editedPaths.has(selected.path) && (
                    <Badge className='shrink-0 text-[10px]'>
                      {t("foundry.edited")}
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className='text-muted-foreground text-xs'>
                  {t("foundry.inspector.path")}
                </dt>
                <dd className='break-all font-mono text-xs'>{selected.path}</dd>
              </div>
              <div className='flex gap-6'>
                <Field label={t("foundry.inspector.type")}>
                  {selected.ext}
                </Field>
                <Field label={t("foundry.inspector.size")}>
                  {formatBytes(selected.size)}
                </Field>
                <Field label={t("foundry.inspector.source")}>
                  {t(`foundry.inspector.sources.${selected.source}`)}
                </Field>
              </div>
              {texturePreview.status === "ready" &&
                texturePreview.width &&
                texturePreview.height && (
                  <Field label={t("foundry.inspector.dimensions")}>
                    {texturePreview.width} × {texturePreview.height}
                  </Field>
                )}
              {modelPreview.status === "ready" &&
                modelPreview.vertexCount &&
                modelPreview.indexCount && (
                  <div className='flex gap-6'>
                    <Field label={t("foundry.inspector.vertices")}>
                      {modelPreview.vertexCount.toLocaleString()}
                    </Field>
                    <Field label={t("foundry.inspector.triangles")}>
                      {Math.floor(modelPreview.indexCount / 3).toLocaleString()}
                    </Field>
                  </div>
                )}
            </dl>

            <FoundryEditorControls entry={selected} />
          </>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t("foundry.inspector.noSelection")}
          </p>
        )}
      </div>
    </ScrollArea>
  );
};
