import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { Info, Megaphone, Warning, Wrench } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { format, formatDistanceToNow } from "date-fns";
import { Markup } from "interweave";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { getAnnouncements } from "@/lib/api";
import { DashboardCard } from "./dashboard-card";

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "maintenance":
      return Wrench;
    case "downtime":
      return Warning;
    case "info":
    default:
      return Info;
  }
};

const getCategoryLabel = (category: string): string => {
  switch (category) {
    case "maintenance":
      return "Maintenance";
    case "downtime":
      return "Downtime";
    case "info":
      return "Info";
    default:
      return "Info";
  }
};

interface AnnouncementCategoryIconProps {
  category: string;
  size?: "sm" | "md";
}

const AnnouncementCategoryIcon = ({
  category,
  size = "sm",
}: AnnouncementCategoryIconProps) => {
  const IconComponent = getCategoryIcon(category);
  const sizeClasses = size === "sm" ? "h-10 w-10" : "h-12 w-12";
  const iconSizeClasses = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div
      className={`${sizeClasses} shrink-0 rounded bg-muted flex items-center justify-center`}>
      <IconComponent className={iconSizeClasses} weight='duotone' />
    </div>
  );
};

export const AnnouncementsCard = () => {
  const { t } = useTranslation();
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AnnouncementDto | null>(null);
  const { data: announcements, isLoading } = useQuery(
    "announcements",
    getAnnouncements,
  );

  return (
    <>
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
                className='rounded-lg border p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors'
                onClick={() => setSelectedAnnouncement(announcement)}>
                <div className='flex items-start gap-3'>
                  {announcement.iconUrl ? (
                    <img
                      alt={announcement.title}
                      className='h-10 w-10 shrink-0 rounded object-cover'
                      src={announcement.iconUrl}
                    />
                  ) : (
                    <AnnouncementCategoryIcon
                      category={announcement.category}
                      size='sm'
                    />
                  )}
                  <div className='flex-1 min-w-0 space-y-2'>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='flex items-center gap-2 flex-1 min-w-0'>
                        <h3 className='font-semibold text-sm leading-tight'>
                          {announcement.title}
                        </h3>
                        <Badge
                          variant={
                            announcement.category === "maintenance"
                              ? "default"
                              : announcement.category === "downtime"
                                ? "destructive"
                                : "secondary"
                          }
                          className='shrink-0 text-xs'>
                          {getCategoryLabel(announcement.category)}
                        </Badge>
                      </div>
                      <span className='text-xs text-muted-foreground whitespace-nowrap'>
                        {formatDistanceToNow(
                          new Date(
                            announcement.publishedAt ||
                              announcement.createdAt ||
                              new Date(),
                          ),
                          { addSuffix: true },
                        )}
                      </span>
                    </div>
                    <div className='prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground line-clamp-2'>
                      <Markup content={announcement.content} />
                    </div>
                  </div>
                  {announcement.linkUrl && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        open(announcement.linkUrl!);
                      }}
                      size='sm'
                      variant='outline'
                      className='mt-2'>
                      {announcement.linkLabel || "Learn More"}
                    </Button>
                  )}
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

      <Dialog
        open={selectedAnnouncement !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAnnouncement(null);
        }}>
        {selectedAnnouncement && (
          <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
            <DialogHeader>
              <div className='flex items-start gap-4'>
                {selectedAnnouncement.iconUrl ? (
                  <img
                    alt={selectedAnnouncement.title}
                    className='h-12 w-12 shrink-0 rounded object-cover'
                    src={selectedAnnouncement.iconUrl}
                  />
                ) : (
                  <AnnouncementCategoryIcon
                    category={selectedAnnouncement.category}
                    size='md'
                  />
                )}
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 mb-1'>
                    <DialogTitle>{selectedAnnouncement.title}</DialogTitle>
                    <Badge
                      variant={
                        selectedAnnouncement.category === "maintenance"
                          ? "default"
                          : selectedAnnouncement.category === "downtime"
                            ? "destructive"
                            : "secondary"
                      }
                      className='shrink-0'>
                      {getCategoryLabel(selectedAnnouncement.category)}
                    </Badge>
                  </div>
                  <DialogDescription className='mt-1'>
                    {format(
                      new Date(
                        selectedAnnouncement.publishedAt ||
                          selectedAnnouncement.createdAt ||
                          new Date(),
                      ),
                      "PPp",
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className='prose prose-sm dark:prose-invert max-w-none text-sm'>
              <Markup content={selectedAnnouncement.content} />
            </div>
            {selectedAnnouncement.linkUrl && (
              <DialogFooter>
                <Button
                  onClick={() => open(selectedAnnouncement.linkUrl!)}
                  variant='default'>
                  {selectedAnnouncement.linkLabel || "Learn More"}
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
};
