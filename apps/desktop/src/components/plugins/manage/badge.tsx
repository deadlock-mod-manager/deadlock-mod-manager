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
      "flex items-center gap-[4px] rounded-[6px] px-[8px] py-[2px] font-medium text-muted-foreground text-[11px] leading-[normal] outline-border",
      INSET_OUTLINE,
      mono && "font-mono",
    )}>
    {children}
  </span>
);
