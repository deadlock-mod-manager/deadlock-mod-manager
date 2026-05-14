// oxlint-disable import/no-unassigned-import
import "yet-another-react-lightbox/styles.css";

import type { NSFWSettings } from "@deadlock-mods/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Button } from "@deadlock-mods/ui/components/button";
import { Eye, EyeOff } from "@deadlock-mods/ui/icons";
import { Lightbox } from "yet-another-react-lightbox";
import ZoomPlugin from "yet-another-react-lightbox/plugins/zoom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NSFWBlur } from "@/components/mod-browsing/nsfw-blur";

interface ModGalleryProps {
  images: string[];
  shouldBlur?: boolean;
  nsfwSettings: NSFWSettings;
  onNSFWToggle: (visible: boolean) => void;
}

export const ModGallery = ({
  images,
  shouldBlur = false,
  nsfwSettings,
  onNSFWToggle,
}: ModGalleryProps) => {
  const { t } = useTranslation();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryResetVersion, setGalleryResetVersion] = useState(0);
  const hasBlurredNsfwImages = shouldBlur && !nsfwSettings.disableBlur;

  if (!images || images.length === 0) {
    return null;
  }

  const toggleGalleryVisibility = () => {
    setGalleryVisible((visible) => {
      const nextVisible = !visible;

      if (!nextVisible) {
        setGalleryResetVersion((version) => version + 1);
      }

      return nextVisible;
    });
  };

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle>{t("ui.gallery")}</CardTitle>
        {hasBlurredNsfwImages && (
          <Button
            className='gap-1 text-xs'
            onClick={toggleGalleryVisibility}
            size='sm'
            variant='secondary'>
            {galleryVisible ? (
              <EyeOff className='h-3 w-3' />
            ) : (
              <Eye className='h-3 w-3' />
            )}
            {galleryVisible ? t("filters.hideNSFW") : t("filters.showNSFW")}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
          {images.map((image, index) => (
            <button
              className='group relative overflow-hidden rounded-md border border-border bg-muted text-left outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring'
              key={`${image}-${galleryResetVersion}`}
              onClick={() => {
                setLightboxIndex(index);
                setLightboxOpen(true);
              }}
              type='button'>
              <NSFWBlur
                blurStrength={nsfwSettings.blurStrength}
                className='aspect-video w-full'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={hasBlurredNsfwImages && !galleryVisible}
                onToggleVisibility={onNSFWToggle}>
                <img
                  alt={t("ui.screenshot", { number: index + 1 })}
                  className='aspect-video w-full object-contain'
                  decoding='async'
                  height='225'
                  loading='lazy'
                  src={image}
                  width='400'
                />
              </NSFWBlur>
              <span className='pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-black/5 group-hover:bg-black/5' />
            </button>
          ))}
        </div>

        <Lightbox
          carousel={{ imageFit: "contain" }}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          open={lightboxOpen}
          plugins={[ZoomPlugin]}
          slides={images.map((src, index) => ({
            alt: t("ui.screenshot", { number: index + 1 }),
            src,
          }))}
          zoom={{ scrollToZoom: true }}
        />
      </CardContent>
    </Card>
  );
};
