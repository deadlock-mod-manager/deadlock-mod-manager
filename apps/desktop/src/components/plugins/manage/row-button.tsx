import type { Icon } from "@phosphor-icons/react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { cn } from "@/lib/utils";

type RowButtonProps = ComponentPropsWithoutRef<"button"> & {
  icon: Icon;
  variant?: "outline" | "primary";
};

/** The compact 13px action buttons used in plugin rows and cards. */
export const RowButton = forwardRef<HTMLButtonElement, RowButtonProps>(
  (
    { icon: ButtonIcon, variant = "outline", className, children, ...props },
    ref,
  ) => (
    <button
      className={cn(
        "relative flex shrink-0 items-center gap-[8px] rounded-[8px] px-[12px] py-[6px] font-semibold text-[13px] leading-[normal] transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : cn(
              "bg-background text-foreground outline-border hover:bg-foreground/[0.06]",
              INSET_OUTLINE,
            ),
        className,
      )}
      ref={ref}
      type='button'
      {...props}>
      <ButtonIcon color='currentColor' size={16} />
      {children}
    </button>
  ),
);

RowButton.displayName = "RowButton";
