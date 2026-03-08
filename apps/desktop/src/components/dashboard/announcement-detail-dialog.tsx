import type { AnnouncementDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { format } from "date-fns";
import { Markup } from "interweave";
import { useTranslation } from "react-i18next";
import { transformMarkupLinks } from "@/lib/markup-transform";
import {
  AnnouncementIcon,
  CategoryBadge,
  getAnnouncementDate,
  handleOpenLink,
} from "./announcement-utils";

export const AnnouncementDetailDialog = ({
  announcement,
  onClose,
}: {
  announcement: AnnouncementDto | null;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Dialog
      open={announcement !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      <DialogContent className='max-w-2xl max-h-[80vh] overflow-y-auto'>
        {announcement && (
          <>
            <DialogHeader>
              <div className='flex items-start gap-4'>
                <AnnouncementIcon announcement={announcement} size='md' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2 mb-1'>
                    <DialogTitle>{announcement.title}</DialogTitle>
                    <CategoryBadge category={announcement.category} />
                  </div>
                  <DialogDescription className='mt-1'>
                    {format(getAnnouncementDate(announcement), "PPp")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className='prose prose-sm dark:prose-invert max-w-none text-sm'>
              <Markup
                content={announcement.content}
                transform={transformMarkupLinks}
              />
            </div>
            {announcement.linkUrl && (
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (announcement.linkUrl)
                      handleOpenLink(announcement.linkUrl);
                  }}
                  variant='default'>
                  {announcement.linkLabel || t("dashboard.learnMore")}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
