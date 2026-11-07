import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowRight } from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import { HeroSectionHeader } from "@/components/skins/hero-section-header";
import ModCardSkeleton from "@/components/skeletons/mod-card";
import { ModCategory } from "@/lib/constants";
import {
  CATALOG_QUERY_DEFAULTS,
  queryGameBananaCatalog,
} from "@/lib/gamebanana-catalog";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";

const POPULAR_SKIN_COUNT = 4;

interface PopularHeroSkinsProps {
  hero: string;
  onSeeAll: () => void;
}

/** The store's most downloaded skins for a hero that has none yet. */
export const PopularHeroSkins = ({ hero, onSeeAll }: PopularHeroSkinsProps) => {
  const { t } = useTranslation();
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  const { data: skins, isPending } = useQuery({
    queryKey: [
      ...MODS_LIST_QUERY_KEY,
      "popular-hero-skins",
      { hero, hideNSFW },
    ],
    queryFn: async () => {
      const page = await queryGameBananaCatalog({
        ...CATALOG_QUERY_DEFAULTS,
        heroes: [hero],
        categories: [ModCategory.SKINS],
        hideNsfw: hideNSFW,
        hideObsolete: true,
        sort: "downloadCount",
        pageSize: POPULAR_SKIN_COUNT,
      });
      return page.items;
    },
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  // A hero the catalog has no skins for gets the empty state above alone.
  if (!isPending && !skins?.length) {
    return null;
  }

  return (
    <section className='flex flex-col gap-3'>
      <HeroSectionHeader
        action={
          <Button
            className='h-7 gap-1 px-2'
            onClick={onSeeAll}
            size='sm'
            variant='ghost'>
            {t("skins.seeAll")}
            <ArrowRight className='h-3.5 w-3.5' />
          </Button>
        }
        hint={t("skins.popularHint", { hero })}
        title={t("skins.popularTitle", { hero })}
      />
      <div className='grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3'>
        {isPending
          ? Array.from({ length: POPULAR_SKIN_COUNT }, (_, index) => (
              <ModCardSkeleton key={index} />
            ))
          : skins?.map((mod) => (
              <ModCard collection='skins' key={mod.remoteId} mod={mod} />
            ))}
      </div>
    </section>
  );
};
