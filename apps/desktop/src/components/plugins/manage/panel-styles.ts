import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { cn } from "@/lib/utils";

export const PANEL_CLASS = cn(
  "flex h-full w-[480px] shrink-0 flex-col overflow-hidden rounded-[14px] bg-card outline-foreground/[0.06]",
  INSET_OUTLINE,
);
