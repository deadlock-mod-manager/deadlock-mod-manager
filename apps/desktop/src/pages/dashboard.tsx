import { useTranslation } from "react-i18next";
import { AnnouncementsCard } from "@/components/dashboard/announcements-card";
import { LatestModsCard } from "@/components/dashboard/latest-mods-card";
import { PopularModsCard } from "@/components/dashboard/popular-mods-card";
import { WhatsNewCard } from "@/components/dashboard/whats-new-card";
import PageTitle from "@/components/shared/page-title";
import { usePersistedStore } from "@/lib/store";
import { selectIsDeadlockApiTheme } from "@/lib/store/selectors";

const Dashboard = () => {
  const { t } = useTranslation();
  const isDeadlockApiTheme = usePersistedStore(selectIsDeadlockApiTheme);

  if (isDeadlockApiTheme) {
    return (
      <div className='flex h-full w-full flex-col overflow-hidden'>
        <div className='px-4 mb-4'>
          <PageTitle title={t("dashboard.title")} />
        </div>
        <div className='flex-1 overflow-y-scroll overflow-x-hidden px-4'>
          <div className='pt-[30px] pb-[30px]'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
              <LatestModsCard />
              <AnnouncementsCard />
              <PopularModsCard />
              <WhatsNewCard />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex h-full w-full flex-col px-4 overflow-hidden'>
      <PageTitle className='mb-4' title={t("dashboard.title")} />
      <div className='flex-1 pb-4 overflow-y-auto'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
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
