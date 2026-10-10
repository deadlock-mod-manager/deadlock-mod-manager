import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { CatalogCollectionDto } from "@/types/generated/CatalogCollectionDto";
import { CollectionCover } from "./collection-cover";

export const CollectionCard = memo(
  ({ collection }: { collection: CatalogCollectionDto }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
      <button
        className='group relative block aspect-[3/4] w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm outline-none transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring'
        onClick={() => navigate(`/collections/${collection.id}`)}
        type='button'>
        <CollectionCover
          className='absolute inset-0 h-full w-full transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none'
          collection={collection}
        />
        <span className='absolute top-2.5 right-2.5 rounded-md bg-background/70 px-2 py-0.5 text-xs tabular-nums backdrop-blur-sm'>
          {t("collections.itemCount", { count: collection.itemCount })}
        </span>
        <div className='absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-background via-background/80 to-transparent p-4 pt-16'>
          <span className='line-clamp-2 font-semibold text-lg leading-tight'>
            {collection.name}
          </span>
          <span className='truncate text-muted-foreground text-sm'>
            {t("collections.byAuthor", { author: collection.author })}
          </span>
        </div>
      </button>
    );
  },
);

export const CollectionCardSkeleton = () => (
  <Skeleton className='aspect-[3/4] w-full rounded-lg' />
);
