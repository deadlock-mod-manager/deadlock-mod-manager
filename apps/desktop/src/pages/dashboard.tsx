import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { AnnouncementsTicker } from "@/components/dashboard/announcements-ticker";
import { BrowseByHeroRail } from "@/components/dashboard/browse-by-hero-rail";
import { ChangelogRibbon } from "@/components/dashboard/changelog-ribbon";
import { FeaturedModsCarousel } from "@/components/dashboard/featured-mods-carousel";
import { LatestModsCard } from "@/components/dashboard/latest-mods-card";
import { PatchNotesSection } from "@/components/dashboard/patch-notes-section";
import { QuickStatsStrip } from "@/components/dashboard/quick-stats-strip";
import { TrendingCategoryRail } from "@/components/dashboard/trending-category-rail";
import { WhatsNewCard } from "@/components/dashboard/whats-new-card";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import PageTitle from "@/components/shared/page-title";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useFeaturedMods } from "@/hooks/use-featured-mod";
import { useTrendingByCategory } from "@/hooks/use-trending-by-category";
import { getMod } from "@/lib/api-client";
import { MOD_CATEGORY_ORDER } from "@/lib/constants";
import {
  dashboardCatalogQueryKey,
  getDashboardCatalogMods,
} from "@/lib/mods/dashboard-catalog";
import { modDetailQueryKey } from "@/lib/mods/mod-query-cache";
import { filterHiddenNSFWItems } from "@/lib/mods/nsfw-visibility";
import { STALE_TIME_API } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { getPinnedFeaturedModId } from "@/lib/mod-of-the-week";

const Dashboard = () => {
  const { t } = useTranslation();
  const DashboardPage = useThemeOverride("dashboardPage");
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);

  const { data: mods, isPending } = useQuery({
    queryKey: dashboardCatalogQueryKey(hideNSFW),
    queryFn: () => getDashboardCatalogMods({ hideNsfw: hideNSFW }),
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const visibleMods = useMemo(
    () => filterHiddenNSFWItems(mods, hideNSFW),
    [hideNSFW, mods],
  );
  const { data: flags } = useFeatureFlags();
  const pinnedModId = getPinnedFeaturedModId(flags);
  const pinnedMod = useQuery({
    queryKey: modDetailQueryKey(pinnedModId ?? ""),
    queryFn: () => getMod(pinnedModId ?? ""),
    enabled: !!pinnedModId,
    staleTime: STALE_TIME_API,
  });
  const featured = useFeaturedMods(visibleMods, {
    pinned: pinnedModId ? pinnedMod.data : undefined,
  });
  const trending = useTrendingByCategory(visibleMods);

  const visibleCategories = useMemo(
    () =>
      MOD_CATEGORY_ORDER.filter((category) => trending[category]?.length > 0),
    [trending],
  );

  // Themes that ship a `dashboardPage` override expect the legacy children
  // API (Latest / Announcements / What's New cards). Keep them working.
  if (DashboardPage) {
    return (
      <DashboardPage>
        <LatestModsCard />
        <AnnouncementsCard />
        <WhatsNewCard />
      </DashboardPage>
    );
  }

  return (
    <div className='relative z-10 flex h-full w-full flex-col gap-3'>
      <AnnouncementsTicker />
      <div className='px-6'>
        <PageTitle
          subtitle={t("dashboard.subtitle")}
          title={t("dashboard.title")}
        />
      </div>
      <div className='flex-1 space-y-8 overflow-y-auto overflow-x-hidden px-6 pb-8 pr-2'>
        <FeaturedModsCarousel
          isLoading={isPending || (!!pinnedModId && pinnedMod.isPending)}
          mods={featured}
        />

        <QuickStatsStrip />

        <BrowseByHeroRail />

        <div className='space-y-8'>
          {isPending
            ? MOD_CATEGORY_ORDER.slice(0, 3).map((category) => (
                <TrendingCategoryRail
                  category={category}
                  isLoading
                  key={category}
                  mods={[]}
                />
              ))
            : visibleCategories.map((category) => (
                <TrendingCategoryRail
                  category={category}
                  key={category}
                  mods={trending[category] ?? []}
                />
              ))}
        </div>

        <PatchNotesSection />

        <ChangelogRibbon />
      </div>
    </div>
  );
};

export default Dashboard;
