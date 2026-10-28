import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CircleHalfIcon,
  CopyIcon,
  CubeIcon,
  FileIcon,
  ImageIcon,
  MusicNotesIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  FoundryCategory,
  FoundryEntry,
  FoundryManifest,
} from "@/types/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryEditorControls } from "./foundry-editor-controls";
import { formatBytes } from "./foundry-entry-list";

const CATEGORY_ICONS = {
  model: CubeIcon,
  material: CircleHalfIcon,
  texture: ImageIcon,
  card: ImageIcon,
  sound: MusicNotesIcon,
  other: FileIcon,
} satisfies Record<FoundryCategory, React.ElementType>;

const allEntries = (manifest: FoundryManifest): FoundryEntry[] => [
  ...manifest.models,
  ...manifest.materials,
  ...manifest.textures,
  ...manifest.cards,
  ...manifest.sounds,
  ...manifest.other,
];

/**
 * Right-hand panel for the selected file: what it is, where it lives, and the
 * edits that act on it.
 */
export const FoundryInspector = () => {
  const { t } = useTranslation();
  const {
    manifest,
    selectedEntryPath,
    modelPreview,
    texturePreview,
    cardPreviews,
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

  if (!selected) {
    return (
      <p className='p-4 text-muted-foreground text-sm'>
        {t("foundry.inspector.noSelection")}
      </p>
    );
  }

  const Icon = CATEGORY_ICONS[selected.category];
  const facts = [
    t(`foundry.inspector.kinds.${selected.category}`),
    texturePreview.status === "ready" &&
    texturePreview.width &&
    texturePreview.height
      ? `${texturePreview.width} × ${texturePreview.height}`
      : null,
    selected.size > 0 ? formatBytes(selected.size) : null,
    t(`foundry.inspector.from.${selected.source}`),
  ].filter(Boolean);
  const modelStats =
    modelPreview.status === "ready" &&
    modelPreview.vertexCount &&
    modelPreview.indexCount
      ? t("foundry.inspector.modelStats", {
          vertices: modelPreview.vertexCount.toLocaleString(),
          triangles: Math.floor(modelPreview.indexCount / 3).toLocaleString(),
        })
      : null;

  const copyPath = () => {
    navigator.clipboard
      .writeText(selected.path)
      .then(() => toast.success(t("foundry.inspector.pathCopied")))
      .catch(() => undefined);
  };

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-2.5 px-4 py-3.5'>
        <div className='flex items-center gap-2.5'>
          <span className='flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[7px] bg-secondary text-secondary-foreground'>
            <Icon className='h-[17px] w-[17px]' />
          </span>
          <div className='min-w-0'>
            <p className='truncate font-mono font-semibold text-sm'>
              {selected.filename}
            </p>
            <p className='truncate text-[11px] text-muted-foreground'>
              {facts.join(", ")}
            </p>
            {modelStats && (
              <p className='truncate text-[11px] text-muted-foreground'>
                {modelStats}
              </p>
            )}
          </div>
        </div>
        <div className='flex items-start gap-2 rounded-md border bg-background px-2.5 py-[7px]'>
          <p className='min-w-0 flex-1 break-all font-mono text-[11px] text-muted-foreground'>
            {selected.path}
          </p>
          <button
            aria-label={t("foundry.inspector.copyPath")}
            className='mt-px text-muted-foreground transition-colors hover:text-foreground'
            onClick={copyPath}
            title={t("foundry.inspector.copyPath")}
            type='button'>
            <CopyIcon className='h-[13px] w-[13px]' />
          </button>
        </div>
      </div>
      <FoundryEditorControls entry={selected} />
    </ScrollArea>
  );
};
