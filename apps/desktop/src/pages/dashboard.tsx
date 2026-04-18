import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { FeaturedModCard } from "@/components/dashboard/featured-mod-card";
import { LatestModsCard } from "@/components/dashboard/latest-mods-card";
import { QuickStatsStrip } from "@/components/dashboard/quick-stats-strip";
import { TrendingCategoryRail } from "@/components/dashboard/trending-category-rail";
import { WhatsNewCard } from "@/components/dashboard/whats-new-card";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import PageTitle from "@/components/shared/page-title";
import { useFeaturedMod } from "@/hooks/use-featured-mod";
import { useTrendingByCategory } from "@/hooks/use-trending-by-category";
import { getMods } from "@/lib/api";
import { MOD_CATEGORY_ORDER } from "@/lib/constants";
import { STALE_TIME_API } from "@/lib/query-constants";

const Dashboard = () => {
  const { t } = useTranslation();
  const DashboardPage = useThemeOverride("dashboardPage");

  const { data: mods, isPending } = useQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const featured = useFeaturedMod(mods);
  const trending = useTrendingByCategory(mods);

  // Show only the categories that yielded any trending mods. Iterate via the
  // canonical order so the page is stable across renders.
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
    <div className='relative z-10 flex h-full w-full flex-col gap-4 px-6'>
      <PageTitle
        subtitle={t("dashboard.subtitle")}
        title={t("dashboard.title")}
      />
      <div className='flex-1 space-y-6 overflow-y-auto overflow-x-hidden pb-8 pr-2'>
        <FeaturedModCard isLoading={isPending} mod={featured} />

        <QuickStatsStrip />

        <div className='space-y-6'>
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

        <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
          <div className='xl:col-span-2'>
            <LatestModsCard />
          </div>
          <div className='space-y-4'>
            <AnnouncementsCard />
            <WhatsNewCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
