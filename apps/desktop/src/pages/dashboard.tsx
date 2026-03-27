import { useTranslation } from "react-i18next";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { LatestModsCard } from "@/components/dashboard/latest-mods-card";
import { PopularModsCard } from "@/components/dashboard/popular-mods-card";
import { WhatsNewCard } from "@/components/dashboard/whats-new-card";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import PageTitle from "@/components/shared/page-title";

const Dashboard = () => {
  const { t } = useTranslation();
  const DashboardPage = useThemeOverride("dashboardPage");

  const cards = (
    <>
      <LatestModsCard />
      <AnnouncementsCard />
      <PopularModsCard />
      <WhatsNewCard />
    </>
  );

  if (DashboardPage) {
    return <DashboardPage>{cards}</DashboardPage>;
  }

  return (
    <div className='flex h-full w-full flex-col px-4 overflow-hidden'>
      <PageTitle className='mb-4' title={t("dashboard.title")} />
      <div className='flex-1 pb-4 overflow-y-auto'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>{cards}</div>
      </div>
    </div>
  );
};

export default Dashboard;
