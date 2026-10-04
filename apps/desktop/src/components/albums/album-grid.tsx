import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { CardsThreeIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { deadlockSkinsAlbumsQueryOptions } from "@/lib/deadlockskins/albums";
import { AlbumCard, AlbumCardSkeleton } from "./album-card";
import { DeadlockSkinsCredit } from "./deadlockskins-credit";

const GRID_CLASS =
  "grid grid-cols-2 gap-4 px-1 pr-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

export const AlbumGrid = () => {
  const { t } = useTranslation();
  const { data: albums } = useSuspenseQuery(deadlockSkinsAlbumsQueryOptions());

  if (albums.length === 0) {
    return (
      <Empty className='py-12'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <CardsThreeIcon className='h-16 w-16' />
          </EmptyMedia>
          <EmptyTitle>{t("albums.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("albums.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className='min-h-0 flex-1 overflow-auto pb-24'>
      <DeadlockSkinsCredit className='mb-4 px-1' />
      <div className={GRID_CLASS}>
        {albums.map((album) => (
          <AlbumCard album={album} key={album.slug} />
        ))}
      </div>
    </div>
  );
};

export const AlbumGridSkeleton = () => (
  <div className='min-h-0 flex-1 overflow-hidden'>
    <div className={GRID_CLASS}>
      {Array.from({ length: 12 }, (_, index) => (
        <AlbumCardSkeleton key={index} />
      ))}
    </div>
  </div>
);
