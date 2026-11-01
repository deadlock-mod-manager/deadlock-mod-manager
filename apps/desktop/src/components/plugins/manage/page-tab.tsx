import type { Icon } from "@phosphor-icons/react";
import {
  ArrowCircleUpIcon,
  CompassIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Tab } from "@/components/plugins/manage/manage-tabs";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { cn } from "@/lib/utils";

const TAB_ICONS = {
  installed: SquaresFourIcon,
  discover: CompassIcon,
  updates: ArrowCircleUpIcon,
} satisfies Record<Tab, Icon>;

type PageTabProps = {
  tab: Tab;
  active: boolean;
  count?: number;
  countTone?: "neutral" | "info";
  onSelect: () => void;
};

export const PageTab = ({
  tab,
  active,
  count,
  countTone,
  onSelect,
}: PageTabProps) => {
  const { t } = useTranslation();
  const TabIcon = TAB_ICONS[tab];
  const info = countTone === "info";
  return (
    <button
      aria-selected={active}
      className={cn(
        "flex items-center gap-[8px] rounded-[8px] px-[14px] py-[8px] transition-colors",
        INSET_OUTLINE,
        active
          ? "bg-[#1E1A18] outline-[#EFE0BE26]"
          : "outline-transparent hover:bg-[#1E1A18]",
      )}
      onClick={onSelect}
      role='tab'
      type='button'>
      <TabIcon color={active ? "#EFE0BE" : "#A3A3A3"} size={15} />
      <span
        className={cn(
          "font-semibold text-[13px] leading-[normal]",
          active ? "text-foreground" : "text-[#A3A3A3]",
        )}>
        {t(`plugins.manage.tabs.${tab}`)}
      </span>
      {count !== undefined && (
        <span
          className='rounded-[99px] px-[7px] py-[1px] font-mono font-semibold text-[11px] leading-[normal]'
          style={{
            backgroundColor: info ? "#60A5FA26" : "#FFFFFF0F",
            color: info ? TONE_COLOR.info : "#A3A3A3",
          }}>
          {count}
        </span>
      )}
    </button>
  );
};
