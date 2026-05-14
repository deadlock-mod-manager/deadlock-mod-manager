import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { Star } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import ModCard from "@/components/mod-browsing/mod-card";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { getMods } from "@/lib/api-client";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";

const FavoritesData = () => {
  const { t } = useTranslation();
  const { data, error } = useSuspenseQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    retry: 3,
  });
  const favorites = usePersistedStore((state) => state.favorites);

  const favoritedMods = useMemo(() => {
    if (!data) return [];
    const favSet = new Set(favorites);
    return data.filter((mod) => favSet.has(mod.remoteId));
  }, [data, favorites]);

  useEffect(() => {
    if (error) {
      toast.error((error as Error)?.message ?? t("common.failedToFetchMods"));
    }
  }, [error, t]);

  if (favoritedMods.length === 0) {
    return (
      <Empty className='py-12'>
        <EmptyHeader>
          <EmptyMedia variant='default'>
            <Star className='h-16 w-16' weight='duotone' />
          </EmptyMedia>
          <EmptyTitle>{t("favorites.emptyTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("favorites.emptyDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className='grid grid-cols-1 gap-4 px-1 pb-24 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
      {favoritedMods.map((mod) => (
        <ModCard key={mod.id} mod={mod} />
      ))}
    </div>
  );
};

const FavoritesSkeleton = () => (
  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
    {Array.from({ length: 12 }, (_, i) => (
      <ModCard key={i} mod={undefined} />
    ))}
  </div>
);

const Favorites = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/mods");
    }
  }, [navigate]);

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      <div className='mb-4 flex items-center pt-2'>
        <Button
          className='flex items-center gap-1'
          onClick={goBack}
          size='sm'
          variant='ghost'>
          <ArrowLeft className='h-4 w-4' />
          {t("favorites.back")}
        </Button>
      </div>
      <PageTitle
        className='mb-8'
        subtitle={t("favorites.subtitle")}
        title={t("favorites.title")}
      />
      <div className='min-h-0 flex-1 overflow-auto'>
        <Suspense fallback={<FavoritesSkeleton />}>
          <ErrorBoundary>
            <FavoritesData />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
};

export default Favorites;
