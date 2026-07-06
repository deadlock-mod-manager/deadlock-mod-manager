import { Progress } from "@deadlock-mods/ui/components/progress";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CubeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useFoundry } from "./foundry-context";

interface FoundryPreviewProps {
  /** 0–100 while the (future) 3D model streams in; null hides the bar. */
  loadProgress?: number | null;
}

/**
 * The always-visible result surface in the middle of the Foundry. Today it shows
 * the decoded texture / card and a loading bar; the live 3D turntable mounts here
 * next.
 */
export const FoundryPreview = ({
  loadProgress = null,
}: FoundryPreviewProps) => {
  const { t } = useTranslation();
  const { manifest, texturePreview } = useFoundry();

  const imageUrl = texturePreview.dataUrl;
  const decoding = texturePreview.status === "loading";
  const streaming = loadProgress !== null;
  const showBar = decoding || streaming;

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
          <CubeIcon className='h-14 w-14 opacity-40' weight='duotone' />
          <p className='text-sm'>
            {texturePreview.status === "error"
              ? t("foundry.preview.decodeFailed")
              : decoding
                ? t("foundry.preview.decoding")
                : manifest
                  ? t("foundry.preview.placeholder", {
                      hero:
                        manifest.heroDisplay ??
                        t("foundry.preview.unknownHero"),
                    })
                  : t("foundry.preview.empty")}
          </p>
        </div>
      )}

      {showBar && (
        <div className='absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-background/90 to-transparent p-4'>
          <div className='flex items-center justify-between text-muted-foreground text-xs'>
            <span>
              {streaming
                ? t("foundry.preview.loading")
                : t("foundry.preview.decoding")}
            </span>
            {streaming && <span>{Math.round(loadProgress ?? 0)}%</span>}
          </div>
          {streaming ? (
            <Progress value={loadProgress ?? 0} />
          ) : (
            <div className='h-2 w-full overflow-hidden bg-primary/20'>
              <div className='h-full w-1/2 animate-pulse bg-primary' />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
