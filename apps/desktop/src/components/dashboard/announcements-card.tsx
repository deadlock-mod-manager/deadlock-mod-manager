import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Megaphone } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { DashboardCard } from "./dashboard-card";

export const AnnouncementsCard = () => {
  const { t } = useTranslation();

  return (
    <DashboardCard
      icon={<Megaphone className='h-5 w-5' weight='duotone' />}
      title={t("dashboard.announcements")}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Megaphone className='h-6 w-6' weight='duotone' />
          </EmptyMedia>
          <EmptyTitle>{t("dashboard.noAnnouncementsTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("dashboard.noAnnouncementsDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </DashboardCard>
  );
};
