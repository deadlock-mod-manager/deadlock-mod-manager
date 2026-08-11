import { Button } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CubeIcon, ImageIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { FoundrySkinAssembling } from "./foundry-assembling";
import { useFoundry } from "./foundry-context";
import { FoundryLoadingBar } from "./foundry-loading-bar";
import { FoundryModelViewer } from "./foundry-model-viewer";

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
    preview3dEnabled,
  } = useFoundry();
  const setPreview3d = usePersistedStore(
    (state) => state.setFoundry3dPreviewEnabled,
  );

  // Only the asset browser and the paint tab have a 3D surface; cards render
  // their texture, and sounds have nothing to show.
  const showModel = activeTab === "assets" || activeTab === "paint";
  const imageUrl = activeTab === "cards" ? texturePreview.dataUrl : null;
  const modelUrl = showModel ? modelPreview.dataUrl : null;
  const decodingTexture = texturePreview.status === "loading";
  // A paint bake re-encodes several textures and then the model is decoded
  // again, so both halves of that wait get the same indicator.
  const rebuildingModel =
    showModel && (modelPreview.status === "loading" || busy);

  // With the preview off nothing was decoded, so say so and offer the switch
  // rather than showing an empty panel that looks like a failure.
  if (showModel && !preview3dEnabled) {
    return (
      <div className='flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border bg-gradient-to-b from-muted/40 to-background p-8 text-center'>
        <CubeIcon
          className='h-14 w-14 text-muted-foreground opacity-40'
          weight='duotone'
        />
        <div className='max-w-sm space-y-1'>
          <p className='font-medium text-sm'>{t("foundry.preview.disabled")}</p>
          <p className='text-muted-foreground text-xs'>
            {t("foundry.preview.disabledHint")}
          </p>
        </div>
        <Button onClick={() => setPreview3d(true)} size='sm' variant='outline'>
          {t("foundry.preview.enable")}
        </Button>
      </div>
    );
  }

  if (modelUrl && !rebuildingModel) {
    return (
      <div className='relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-b from-muted/40 to-background'>
        <FoundryModelViewer
          dataUrl={modelUrl}
          label={selectedEntryPath ?? t("foundry.preview.alt")}
          tint={previewTint}
        />
      </div>
    );
  }

  // While the model is being built, the assembling figure stands in for it: the
  // same silhouette, made of particles, so the panel never sits empty.
  if (rebuildingModel) {
    return (
      <div className='relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-b from-muted/40 to-background'>
        <FoundrySkinAssembling />
        <div className='absolute inset-x-0 bottom-0 space-y-2 p-6'>
          <p className='text-center text-muted-foreground text-sm'>
            {t(busy ? "foundry.preview.painting" : "foundry.preview.loading")}
          </p>
          <FoundryLoadingBar />
        </div>
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
    <div className='relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-b from-muted/40 to-background'>
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
