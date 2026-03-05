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
import {
  ArrowSquareOutIcon,
  InfoIcon,
  MegaphoneIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format, formatDistanceToNow } from "date-fns";
import { Markup } from "interweave";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnnouncements } from "@/lib/api";
import { STALE_TIME_API } from "@/lib/query-constants";
import { transformMarkupLinks } from "@/lib/markup-transform";
import { DashboardCard } from "./dashboard-card";

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "maintenance":
      return WrenchIcon;
    case "downtime":
      return WarningIcon;
    default:
      return InfoIcon;
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

const getCategoryVariant = (
  category: string,
): "default" | "destructive" | "secondary" => {
  if (category === "maintenance") return "default";
  if (category === "downtime") return "destructive";
  return "secondary";
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
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: getAnnouncements,
    staleTime: STALE_TIME_API,
    refetchOnWindowFocus: false,
  });

  const announcementsContent =
    announcements && announcements.length > 0 ? (
      announcements.map((announcement: AnnouncementDto) => (
        <button
          key={announcement.id}
          type='button'
          className='w-full rounded-lg border p-3 space-y-2 text-left cursor-pointer hover:bg-muted/50 transition-colors'
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
              <div className='flex items-center gap-2 flex-wrap'>
                <h3 className='font-semibold text-sm leading-tight'>
                  {announcement.title}
                </h3>
                <Badge
                  variant={getCategoryVariant(announcement.category)}
                  className='shrink-0 text-xs'>
                  {getCategoryLabel(announcement.category)}
                </Badge>
              </div>
              <span className='text-xs text-muted-foreground'>
                {formatDistanceToNow(
                  new Date(
                    announcement.publishedAt ||
                      announcement.createdAt ||
                      new Date(),
                  ),
                  { addSuffix: true },
                )}
              </span>
              <div className='prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground line-clamp-2'>
                <Markup
                  content={announcement.content}
                  transform={transformMarkupLinks}
                />
              </div>
              {announcement.linkUrl && (
                <div className='flex justify-end'>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (announcement.linkUrl) {
                        openUrl(announcement.linkUrl);
                      }
                    }}
                    size='sm'
                    variant='outline'
                    className='gap-1.5'>
                    {announcement.linkLabel || "Learn More"}
                    <ArrowSquareOutIcon className='h-3.5 w-3.5' />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </button>
      ))
    ) : (
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

  return (
    <>
      <DashboardCard
        icon={<MegaphoneIcon className='h-5 w-5' weight='duotone' />}
        title={t("dashboard.announcements")}>
        <div className='space-y-3'>
          {isLoading
            ? Array.from({ length: 3 }).map(() => (
                <div key={crypto.randomUUID()} className='space-y-2'>
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-3 w-full' />
                  <Skeleton className='h-3 w-2/3' />
                </div>
              ))
            : announcementsContent}
        </div>
      </DashboardCard>

      <Dialog
        open={selectedAnnouncement !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAnnouncement(null);
        }}>
        <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
          {selectedAnnouncement && (
            <>
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
                        variant={getCategoryVariant(
                          selectedAnnouncement.category,
                        )}
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
                <Markup
                  content={selectedAnnouncement.content}
                  transform={transformMarkupLinks}
                />
              </div>
              {selectedAnnouncement.linkUrl && (
                <DialogFooter>
                  <Button
                    onClick={() => {
                      if (selectedAnnouncement.linkUrl) {
                        openUrl(selectedAnnouncement.linkUrl);
                      }
                    }}
                    variant='default'>
                    {selectedAnnouncement.linkLabel || "Learn More"}
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
