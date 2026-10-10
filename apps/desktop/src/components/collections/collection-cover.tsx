import { CardsThreeIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { CatalogCollectionDto } from "@/types/generated/CatalogCollectionDto";

// Tile layouts for one to four preview images; three puts the first on its own row.
const MOSAIC_CLASS = [
  "grid-cols-1",
  "grid-cols-2",
  "grid-cols-2 grid-rows-2 [&>*:first-child]:col-span-2",
  "grid-cols-2 grid-rows-2",
];

/**
 * The collection's GameBanana cover, or a mosaic of its first mods' thumbnails
 * when GameBanana only has the generic placeholder.
 */
export const CollectionCover = ({
  collection: { coverUrl, previewImages, isNsfw },
  className,
  iconClassName,
}: {
  collection: CatalogCollectionDto;
  className?: string;
  iconClassName?: string;
}) => {
  const imageClass = "h-full w-full object-cover object-top";

  // Only the uploader's own cover can be explicit; generated covers skip NSFW mods.
  if (coverUrl) {
    return (
      <img
        alt=''
        className={cn(imageClass, isNsfw && "blur-xl", className)}
        decoding='async'
        loading='lazy'
        src={coverUrl}
      />
    );
  }

  if (previewImages.length > 0) {
    return (
      <div
        className={cn(
          "grid gap-px bg-border",
          MOSAIC_CLASS[previewImages.length - 1],
          className,
        )}>
        {previewImages.map((image) => (
          <img
            alt=''
            className={cn(imageClass, "min-h-0")}
            decoding='async'
            key={image}
            loading='lazy'
            src={image}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center bg-muted", className)}>
      <CardsThreeIcon
        className={cn("h-12 w-12 text-muted-foreground", iconClassName)}
        weight='duotone'
      />
    </div>
  );
};
