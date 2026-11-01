import type { ReactNode } from "react";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { cn } from "@/lib/utils";

export const Badge = ({
  children,
  mono,
}: {
  children: ReactNode;
  mono?: boolean;
}) => (
  <span
    className={cn(
      "flex items-center gap-[4px] rounded-[6px] px-[8px] py-[2px] font-medium text-[#A3A3A3] text-[11px] leading-[normal] outline-[#262626]",
      INSET_OUTLINE,
      mono && "font-mono",
    )}>
    {children}
  </span>
);
