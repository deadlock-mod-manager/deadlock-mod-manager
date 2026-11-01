import type { Icon } from "@phosphor-icons/react";
import {
  ArrowCircleUpIcon,
  CompassIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { Tab } from "@/components/plugins/manage/manage-tabs";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { tint } from "@/components/plugins/plugin-identity";
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
          ? "bg-foreground/[0.06] outline-primary/15"
          : "outline-transparent hover:bg-foreground/[0.06]",
      )}
      onClick={onSelect}
      role='tab'
      type='button'>
      <TabIcon
        className={active ? "text-primary" : "text-muted-foreground"}
        size={15}
      />
      <span
        className={cn(
          "font-semibold text-[13px] leading-[normal]",
          active ? "text-foreground" : "text-muted-foreground",
        )}>
        {t(`plugins.manage.tabs.${tab}`)}
      </span>
      {count !== undefined && (
        <span
          className='rounded-[99px] px-[7px] py-[1px] font-mono font-semibold text-[11px] leading-[normal]'
          style={{
            backgroundColor: info
              ? tint(TONE_COLOR.info, 15)
              : "hsl(var(--foreground) / 0.06)",
            color: info ? TONE_COLOR.info : TONE_COLOR.neutral,
          }}>
          {count}
        </span>
      )}
    </button>
  );
};
