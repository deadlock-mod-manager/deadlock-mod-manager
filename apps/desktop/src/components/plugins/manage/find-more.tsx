import { CompassIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { RowButton } from "@/components/plugins/manage/row-button";
import { cn } from "@/lib/utils";

export const FindMore = ({ onBrowse }: { onBrowse: () => void }) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center gap-[14px] rounded-[12px] p-[16px] outline-foreground/10",
        INSET_OUTLINE,
      )}>
      <span className='flex size-[40px] shrink-0 items-center justify-center rounded-[10px] bg-foreground/[0.04]'>
        <CompassIcon className='text-primary' size={20} />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
        <span className='font-semibold text-[14px] text-foreground leading-[normal]'>
          {t("plugins.manage.findMore.title")}
        </span>
        <span className='w-full text-muted-foreground text-[12px] leading-[17px]'>
          {t("plugins.manage.findMore.body")}
        </span>
      </div>
      <RowButton icon={CompassIcon} onClick={onBrowse}>
        {t("plugins.manage.findMore.browse")}
      </RowButton>
    </div>
  );
};
