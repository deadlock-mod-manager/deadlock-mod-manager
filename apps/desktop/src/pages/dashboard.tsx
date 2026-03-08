import { useTranslation } from "react-i18next";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { LatestModsCard } from "@/components/dashboard/latest-mods-card";
import { PopularModsCard } from "@/components/dashboard/popular-mods-card";
import { WhatsNewCard } from "@/components/dashboard/whats-new-card";
import PageTitle from "@/components/shared/page-title";

const Dashboard = () => {
  const { t } = useTranslation();

  return (
    <div className='flex h-full w-full flex-col overflow-hidden px-4'>
      <PageTitle className='mb-4' title={t("dashboard.title")} />
      <div className='flex-1 overflow-y-auto pb-4'>
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
          <LatestModsCard />
          <AnnouncementsCard />
          <PopularModsCard />
          <WhatsNewCard />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
