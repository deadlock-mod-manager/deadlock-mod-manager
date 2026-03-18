import type { NSFWSettings } from "@deadlock-mods/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@deadlock-mods/ui/components/carousel";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import { useTranslation } from "react-i18next";

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

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle>{t("ui.gallery")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Carousel className='w-full'>
          <div className='relative'>
            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={`image-${image}`}>
                  <div className='p-1'>
                    <Card className='overflow-hidden shadow-none [contain:layout_style_paint]'>
                      <NSFWBlur
                        blurStrength={nsfwSettings.blurStrength}
                        className='aspect-video w-full'
                        disableBlur={nsfwSettings.disableBlur}
                        isNSFW={shouldBlur}
                        onToggleVisibility={onNSFWToggle}>
                        <img
                          alt={`Screenshot ${index + 1}`}
                          className='aspect-video w-full object-cover'
                          decoding='async'
                          height='225'
                          loading='lazy'
                          src={image}
                          width='400'
                        />
                      </NSFWBlur>
                    </Card>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className='left-3 -translate-y-1/2 top-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 border-0 text-white [&_svg]:size-5' />
            <CarouselNext className='right-3 -translate-y-1/2 top-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 border-0 text-white [&_svg]:size-5' />
          </div>
        </Carousel>
      </CardContent>
    </Card>
  );
};
