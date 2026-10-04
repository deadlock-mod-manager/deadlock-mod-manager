import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { CardsThreeIcon } from "@phosphor-icons/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import type { DeadlockSkinsAlbum } from "@/lib/deadlockskins/albums";

// Album covers are 640x853 portrait posters; the title and theme sit on a
// scrim over the art, the way deadlockskins.gg shows them.
export const AlbumCard = memo(({ album }: { album: DeadlockSkinsAlbum }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      className='group relative block aspect-[3/4] w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm outline-none transition-[border-color,box-shadow] hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring'
      onClick={() => navigate(`/albums/${album.slug}`)}
      type='button'>
      {album.coverUrl ? (
        <img
          alt=''
          className='absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none'
          decoding='async'
          loading='lazy'
          src={album.coverUrl}
        />
      ) : (
        <div className='absolute inset-0 flex items-center justify-center bg-muted'>
          <CardsThreeIcon
            className='h-12 w-12 text-muted-foreground'
            weight='duotone'
          />
        </div>
      )}
      <span className='absolute top-2.5 right-2.5 rounded-md bg-background/70 px-2 py-0.5 text-xs tabular-nums backdrop-blur-sm'>
        {t("albums.itemCount", { count: album.itemCount })}
      </span>
      <div className='absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-background via-background/80 to-transparent p-4 pt-16'>
        <span className='font-semibold text-lg leading-tight'>
          {album.name}
        </span>
        {album.description && (
          <span className='line-clamp-2 text-muted-foreground text-sm leading-snug'>
            {album.description}
          </span>
        )}
      </div>
    </button>
  );
});

export const AlbumCardSkeleton = () => (
  <Skeleton className='aspect-[3/4] w-full rounded-lg' />
);
