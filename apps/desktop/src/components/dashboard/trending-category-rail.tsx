import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getModCategoryDisplayName } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import { TrendingModCard, TrendingModCardSkeleton } from "./trending-mod-card";

type Props = {
  category: string;
  mods: ModDto[];
  isLoading?: boolean;
};

const SCROLL_AMOUNT = 600;

export const TrendingCategoryRail = ({ category, mods, isLoading }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const updateModsFilters = usePersistedStore(
    (state) => state.updateModsFilters,
  );

  const handleSeeAll = useCallback(() => {
    updateModsFilters({ selectedCategories: [category] });
    navigate("/mods");
  }, [category, navigate, updateModsFilters]);

  const scrollBy = useCallback((dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  }, []);

  if (!isLoading && mods.length === 0) return null;

  const displayName = getModCategoryDisplayName(category);

  return (
    <section className='space-y-3'>
      <header className='flex items-center justify-between gap-3'>
        <h3
          className='flex items-center gap-2 text-xl font-bold tracking-tight text-foreground lg:text-2xl'
          style={{ fontFamily: '"Forevs Demo", serif' }}>
          <TrendUpIcon className='size-5 text-primary' weight='duotone' />
          <span className='text-white'>{t("dashboard.trendingIn")}</span>{" "}
          <span className='text-primary'>{displayName}</span>
        </h3>
        <div className='flex items-center gap-1'>
          <Button
            aria-label='Scroll left'
            className='size-8'
            onClick={() => scrollBy(-SCROLL_AMOUNT)}
            size='icon'
            variant='ghost'>
            <CaretLeftIcon className='size-4' />
          </Button>
          <Button
            aria-label='Scroll right'
            className='size-8'
            onClick={() => scrollBy(SCROLL_AMOUNT)}
            size='icon'
            variant='ghost'>
            <CaretRightIcon className='size-4' />
          </Button>
          <Button
            className='gap-1.5 text-xs'
            onClick={handleSeeAll}
            size='sm'
            variant='ghost'>
            {t("dashboard.seeAll")}
            <ArrowRightIcon className='size-3.5' />
          </Button>
        </div>
      </header>
      <div
        className='-mx-1 flex gap-6 overflow-x-auto px-1 pb-2 scrollbar-thin'
        ref={scrollerRef}
        style={{ scrollSnapType: "x proximity" }}>
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => (
              <div
                className='shrink-0'
                key={i}
                style={{ scrollSnapAlign: "start" }}>
                <TrendingModCardSkeleton />
              </div>
            ))
          : mods.map((mod) => (
              <div
                className='shrink-0'
                key={mod.id}
                style={{ scrollSnapAlign: "start" }}>
                <TrendingModCard mod={mod} />
              </div>
            ))}
      </div>
    </section>
  );
};
