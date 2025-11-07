import type { AnnouncementDto } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Megaphone } from "@phosphor-icons/react";
import { format } from "date-fns";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { getAnnouncements } from "@/lib/api";
import { DashboardCard } from "./dashboard-card";

export const AnnouncementsCard = () => {
  const { t } = useTranslation();
  const { data: announcements, isLoading } = useQuery(
    "announcements",
    getAnnouncements,
  );

  return (
    <DashboardCard
      icon={<Megaphone className='h-5 w-5' weight='duotone' />}
      title={t("dashboard.announcements")}>
      <div className='space-y-3'>
        {isLoading ? (
          Array.from({ length: 3 }).map(() => (
            <div key={crypto.randomUUID()} className='space-y-2'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-3 w-full' />
              <Skeleton className='h-3 w-2/3' />
            </div>
          ))
        ) : announcements && announcements.length > 0 ? (
          announcements.map((announcement: AnnouncementDto) => (
            <div
              key={announcement.id}
              className='rounded-lg border p-3 space-y-2'>
              <div className='flex items-start gap-3'>
                {announcement.iconUrl && (
                  <img
                    alt={announcement.title}
                    className='h-10 w-10 shrink-0 rounded object-cover'
                    src={announcement.iconUrl}
                  />
                )}
                <div className='flex-1 min-w-0 space-y-2'>
                  <div className='flex items-start justify-between gap-2'>
                    <h3 className='font-semibold text-sm leading-tight'>
                      {announcement.title}
                    </h3>
                    {announcement.publishedAt && (
                      <span className='text-xs text-muted-foreground whitespace-nowrap'>
                        {format(new Date(announcement.publishedAt), "MMM d")}
                      </span>
                    )}
                  </div>
                  <div className='prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground line-clamp-2'>
                    <Markup content={announcement.content} />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
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
        )}
      </div>
    </DashboardCard>
  );
};
