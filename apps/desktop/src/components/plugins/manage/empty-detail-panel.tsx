import { CompassIcon, PuzzlePieceIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { PANEL_CLASS } from "@/components/plugins/manage/panel-styles";
import { RowButton } from "@/components/plugins/manage/row-button";
import { cn } from "@/lib/utils";

/** The detail panel's place when no external plugin is installed. */
export const EmptyDetailPanel = ({ onBrowse }: { onBrowse: () => void }) => {
  const { t } = useTranslation();
  return (
    <aside
      className={cn(
        PANEL_CLASS,
        "items-center justify-center gap-[14px] p-[32px]",
      )}>
      <span className='flex size-[52px] items-center justify-center rounded-[12px] bg-[#FFFFFF0A]'>
        <PuzzlePieceIcon color='#EFE0BE' size={26} />
      </span>
      <div className='flex max-w-[320px] flex-col items-center gap-[4px] text-center'>
        <span className='font-bold text-[17px] text-foreground leading-[normal]'>
          {t("plugins.manage.panel.emptyTitle")}
        </span>
        <span className='text-[#A3A3A3] text-[12px] leading-[17px]'>
          {t("plugins.manage.panel.emptyBody")}
        </span>
      </div>
      <RowButton icon={CompassIcon} onClick={onBrowse}>
        {t("plugins.manage.findMore.browse")}
      </RowButton>
    </aside>
  );
};
