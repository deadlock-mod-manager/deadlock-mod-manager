import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  AnnouncementIcon,
  CategoryBadge,
  getAnnouncementDate,
  handleOpenLink,
} from "./announcement-utils";

export const AnnouncementListItem = ({
  announcement,
  onSelect,
}: {
  announcement: AnnouncementDto;
  onSelect: (announcement: AnnouncementDto) => void;
}) => {
  const { t } = useTranslation();

  return (
    <div
      role='button'
      tabIndex={0}
      className='group w-full cursor-pointer rounded-lg border border-border/40 p-4 text-left transition-colors hover:border-border hover:bg-muted/40'
      onClick={() => onSelect(announcement)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(announcement);
        }
      }}>
      <div className='flex items-start gap-3'>
        <AnnouncementIcon announcement={announcement} size='sm' />
        <div className='min-w-0 flex-1'>
          <div className='mb-1 flex items-center gap-2'>
            <h3 className='truncate font-semibold text-sm'>
              {announcement.title}
            </h3>
            <CategoryBadge
              category={announcement.category}
              className='shrink-0 text-[10px]'
            />
          </div>
          <p className='mb-2 text-muted-foreground text-xs'>
            {formatDistanceToNow(getAnnouncementDate(announcement), {
              addSuffix: true,
            })}
          </p>
          {announcement.linkUrl && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                if (announcement.linkUrl) handleOpenLink(announcement.linkUrl);
              }}
              size='sm'
              variant='ghost'
              className='h-auto gap-1.5 px-0 py-0 text-primary text-xs hover:bg-transparent hover:underline'>
              {announcement.linkLabel || t("dashboard.learnMore")}
              <ArrowSquareOutIcon className='size-3.5' />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
