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
  if (!images || images.length === 0) {
    return null;
  }

  return (
    <Card className='shadow-none' style={{ contain: "layout style paint" }}>
      <CardHeader>
        <CardTitle>Gallery</CardTitle>
      </CardHeader>
      <CardContent>
        <Carousel className='w-full'>
          <div className='relative'>
            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={`image-${image}`}>
                  <div className='p-1'>
                    <Card
                      className='overflow-hidden shadow-none'
                      style={{ contain: "layout style paint" }}>
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
            <div className='-right-12 -translate-y-1/2 absolute top-1/2'>
              <CarouselNext />
            </div>
            <div className='-left-12 -translate-y-1/2 absolute top-1/2'>
              <CarouselPrevious />
            </div>
          </div>
        </Carousel>
      </CardContent>
    </Card>
  );
};
