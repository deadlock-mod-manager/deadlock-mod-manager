import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";
import { transformMarkupLinks } from "@/lib/markup-transform";
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
      className='w-full rounded-lg border p-3 space-y-2 text-left cursor-pointer hover:bg-muted/50 transition-colors'
      onClick={() => onSelect(announcement)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(announcement);
        }
      }}>
      <div className='flex items-start gap-3'>
        <AnnouncementIcon announcement={announcement} size='sm' />
        <div className='flex-1 min-w-0 space-y-2'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h3 className='font-semibold text-sm leading-tight'>
              {announcement.title}
            </h3>
            <CategoryBadge
              category={announcement.category}
              className='text-xs'
            />
          </div>
          <span className='text-xs text-muted-foreground'>
            {formatDistanceToNow(getAnnouncementDate(announcement), {
              addSuffix: true,
            })}
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
                  if (announcement.linkUrl)
                    handleOpenLink(announcement.linkUrl);
                }}
                size='sm'
                variant='outline'
                className='gap-1.5'>
                {announcement.linkLabel || t("dashboard.learnMore")}
                <ArrowSquareOutIcon className='h-3.5 w-3.5' />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
