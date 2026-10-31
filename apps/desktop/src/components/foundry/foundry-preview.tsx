import { cn } from "@deadlock-mods/ui/lib/utils";
import { ImageIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { decodeFoundryTexture } from "@/lib/foundry";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import { AnimatedModelPreview } from "./animated-model-preview";
import { ModelLoadingStage } from "./model-loading-stage";

/**
 * The result surface in the middle of the Foundry: the live 3D turntable while a
 * model is selected, the decoded texture for a card, and a particle figure that
 * assembles itself while either is still being decoded.
 */
export const FoundryPreview = () => {
  const { t } = useTranslation();
  const {
    activeTab,
    manifest,
    modelPreview,
    selectedEntryPath,
    texturePreview,
    previewTint,
    busy,
    primaryModelPath,
    paintParts,
    highlightTextures,
    hiddenParts,
    paintSelection,
    togglePaintPart,
    workspace,
    textureRefresh,
    setViewerReady,
    registerHeroCapture,
  } = useFoundry();
  const workspaceRoot = workspace?.root ?? null;
  const filePath = manifest?.filePath ?? null;
  const readTexture = useCallback(
    async (path: string) => {
      if (!filePath) throw new Error("No skin is loaded.");
      return (await decodeFoundryTexture(filePath, path, workspaceRoot))
        .dataUrl;
    },
    [filePath, workspaceRoot],
  );
  const labels = useMemo(
    () =>
      new Map(
        paintParts.map((part) => [part.texture.toLowerCase(), part.label]),
      ),
    [paintParts],
  );
  // The paint tab labels the sections it is about to paint on the model.
  const callouts = useMemo(
    () =>
      activeTab === "paint" && paintSelection.kind === "parts"
        ? paintSelection.textures.map((texture) => ({
            texture: texture.toLowerCase(),
            label: labels.get(texture.toLowerCase()) ?? texture,
          }))
        : undefined,
    [activeTab, paintSelection, labels],
  );
  const partLabel = useCallback(
    (texture: string) => labels.get(texture.toLowerCase()),
    [labels],
  );

  // Only the asset browser and the paint tab have a 3D surface; cards render
  // their texture, and sounds have nothing to show.
  const showModel = activeTab === "assets" || activeTab === "paint";
  const imageUrl = activeTab === "cards" ? texturePreview.dataUrl : null;
  const model = showModel ? modelPreview.model : null;
  const decodingTexture = texturePreview.status === "loading";
  // A paint bake only rewrites color maps, which the viewer swaps in place, so
  // the hero stays on screen through it.
  const rebuildingModel = showModel && modelPreview.status === "loading";

  // The paint tab shows the primary model, the one its sections belong to.
  const modelPath =
    activeTab === "paint" ? primaryModelPath : selectedEntryPath;
  if (model && !rebuildingModel && manifest && modelPath) {
    return (
      <div className='relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-muted/40 to-background'>
        <AnimatedModelPreview
          key={`${manifest.filePath}:${modelPath}`}
          source={{ filePath: manifest.filePath, entryPath: modelPath }}
          model={model}
          label={selectedEntryPath ?? t("foundry.preview.alt")}
          tint={previewTint}
          highlightTextures={highlightTextures}
          hiddenTextures={activeTab === "paint" ? hiddenParts : undefined}
          silhouetteHero={manifest.heroDisplay ?? manifest.hero ?? undefined}
          callouts={callouts}
          // Sections are only picked where they can be painted.
          onPickPart={activeTab === "paint" ? togglePaintPart : undefined}
          partLabel={partLabel}
          textureRefresh={textureRefresh}
          readTexture={readTexture}
          onReadyChange={setViewerReady}
          onHeroCapture={registerHeroCapture}
        />
        {busy && (
          <div
            aria-label={t("foundry.preview.painting")}
            className='absolute inset-x-0 top-0'
            role='status'>
            <FoundryLoadingBar className='rounded-none' />
          </div>
        )}
      </div>
    );
  }

  // While the model is being built, the empty stage stands in for it so the
  // panel never sits empty.
  if (rebuildingModel) {
    return (
      <div className='relative h-full w-full overflow-hidden bg-gradient-to-b from-muted/40 to-background'>
        <ModelLoadingStage
          hero={manifest ? (manifest.heroDisplay ?? manifest.hero) : null}
          status={t("foundry.preview.loading")}
          steps
        />
      </div>
    );
  }

  const PlaceholderIcon = activeTab === "sounds" ? MusicNotesIcon : ImageIcon;
  const placeholder =
    activeTab === "cards"
      ? t("foundry.preview.selectCard")
      : activeTab === "sounds"
        ? t("foundry.preview.soundsPlaceholder")
        : manifest
          ? t("foundry.preview.placeholder", {
              hero: manifest.heroDisplay ?? t("foundry.preview.unknownHero"),
            })
          : t("foundry.preview.empty");

  return (
    <div className='relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-b from-muted/40 to-background'>
      {imageUrl ? (
        <img
          alt={t("foundry.preview.alt")}
          className={cn(
            "max-h-full max-w-full object-contain transition-opacity",
            "[image-rendering:pixelated]",
          )}
          src={imageUrl}
        />
      ) : (
        <div className='flex flex-col items-center gap-3 text-muted-foreground'>
          <PlaceholderIcon className='h-14 w-14 opacity-40' weight='duotone' />
          <p className='text-sm'>
            {modelPreview.status === "error" && showModel
              ? t("foundry.preview.modelDecodeFailed")
              : texturePreview.status === "error"
                ? t("foundry.preview.decodeFailed")
                : decodingTexture
                  ? t("foundry.preview.decoding")
                  : placeholder}
          </p>
        </div>
      )}

      {decodingTexture && (
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4'>
          <FoundryLoadingBar />
        </div>
      )}
    </div>
  );
};
