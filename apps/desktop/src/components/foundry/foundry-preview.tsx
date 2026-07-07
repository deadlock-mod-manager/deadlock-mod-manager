import { cn } from "@deadlock-mods/ui/lib/utils";
import { CubeIcon, ImageIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useFoundry } from "./foundry-context";
import { FoundryModelViewer } from "./foundry-model-viewer";

/**
 * The always-visible result surface in the middle of the Foundry: the live 3D
 * turntable for models, or the decoded texture / card, with a loading bar while
 * either is being decoded.
 */
export const FoundryPreview = () => {
  const { t } = useTranslation();
  const {
    activeTab,
    manifest,
    modelPreview,
    selectedEntryPath,
    texturePreview,
  } = useFoundry();

  const showModel = activeTab === "skin";
  const imageUrl = activeTab === "cards" ? texturePreview.dataUrl : null;
  const modelUrl = showModel ? modelPreview.dataUrl : null;
  const decoding = texturePreview.status === "loading";
  const loadingModel = showModel && modelPreview.status === "loading";
  const showBar = decoding || loadingModel;
  const PlaceholderIcon =
    activeTab === "cards"
      ? ImageIcon
      : activeTab === "sounds"
        ? MusicNotesIcon
        : CubeIcon;
  const placeholderLabel =
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
      {modelUrl ? (
        <FoundryModelViewer
          dataUrl={modelUrl}
          label={selectedEntryPath ?? t("foundry.preview.alt")}
        />
      ) : imageUrl ? (
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
            {showModel && modelPreview.status === "error"
              ? t("foundry.preview.modelDecodeFailed")
              : texturePreview.status === "error"
                ? t("foundry.preview.decodeFailed")
                : loadingModel
                  ? t("foundry.preview.loading")
                  : decoding
                    ? t("foundry.preview.decoding")
                    : placeholderLabel}
          </p>
        </div>
      )}

      {showBar && !modelUrl && (
        <div className='absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/90 to-transparent p-4'>
          <div className='flex items-center justify-between text-muted-foreground text-xs'>
            <span>
              {loadingModel
                ? t("foundry.preview.loading")
                : t("foundry.preview.decoding")}
            </span>
          </div>
          <div className='h-2 w-full overflow-hidden bg-primary/20'>
            <div className='h-full w-1/2 animate-pulse bg-primary' />
          </div>
        </div>
      )}
    </div>
  );
};
