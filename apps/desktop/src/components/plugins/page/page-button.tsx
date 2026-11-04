import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANT_CLASSES = {
  primary:
    "gap-2 bg-primary px-[14px] py-2 font-semibold text-[14px]/[normal] text-primary-foreground hover:bg-primary/90",
  outline:
    "gap-2 bg-background px-[14px] py-2 font-semibold text-[14px]/[normal] text-foreground ring-1 ring-border ring-inset hover:bg-foreground/5",
  ghost:
    "gap-1.5 px-2.5 py-1.5 text-[13px]/[normal] text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
  icon: "size-[34px] justify-center text-foreground ring-1 ring-border ring-inset hover:bg-foreground/5",
} satisfies Record<string, string>;

type PageButtonVariant = keyof typeof VARIANT_CLASSES;

type PageButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: PageButtonVariant;
};

/** The buttons the plugin page designs draw: 8px radius, 16px icons, `normal` leading. */
export const PageButton = ({
  variant,
  className,
  type = "button",
  ...props
}: PageButtonProps) => (
  <button
    className={cn(
      "inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-[8px] leading-[normal] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
      VARIANT_CLASSES[variant],
      className,
    )}
    type={type}
    {...props}
  />
);
