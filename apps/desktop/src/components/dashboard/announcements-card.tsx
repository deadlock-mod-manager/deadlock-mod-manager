import type { AnnouncementDto } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { MegaphoneIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnnouncements } from "@/lib/api";
import { STALE_TIME_API } from "@/lib/query-constants";
import { AnnouncementDetailDialog } from "./announcement-detail-dialog";
import { AnnouncementListItem } from "./announcement-list-item";
import { DashboardCard } from "./dashboard-card";

const AnnouncementsSkeleton = () => (
  <>
    {Array.from({ length: 3 }, (_, i) => (
      <div key={i} className='space-y-2'>
        <Skeleton className='h-4 w-3/4' />
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-2/3' />
      </div>
    ))}
  </>
);

const EmptyAnnouncements = () => {
  const { t } = useTranslation();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <MegaphoneIcon className='h-6 w-6' weight='duotone' />
        </EmptyMedia>
        <EmptyTitle>{t("dashboard.noAnnouncementsTitle")}</EmptyTitle>
        <EmptyDescription>
          {t("dashboard.noAnnouncementsDescription")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};

const AnnouncementsList = ({
  announcements,
  onSelect,
}: {
  announcements: AnnouncementDto[];
  onSelect: (announcement: AnnouncementDto) => void;
}) => {
  if (announcements.length === 0) return <EmptyAnnouncements />;

  return (
    <>
      {announcements.map((announcement) => (
        <AnnouncementListItem
          key={announcement.id}
          announcement={announcement}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

export const AnnouncementsCard = () => {
  const { t } = useTranslation();
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementDto | null>(null);
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: getAnnouncements,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <DashboardCard
        icon={<MegaphoneIcon className='h-5 w-5' weight='duotone' />}
        title={t("dashboard.announcements")}>
        <div className='space-y-3'>
          {isLoading ? (
            <AnnouncementsSkeleton />
          ) : (
            <AnnouncementsList
              announcements={announcements ?? []}
              onSelect={setSelectedAnnouncement}
            />
          )}
        </div>
      </DashboardCard>

      <AnnouncementDetailDialog
        announcement={selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </>
  );
};
