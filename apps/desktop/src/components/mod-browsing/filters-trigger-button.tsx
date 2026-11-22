import { Button } from "@deadlock-mods/ui/components/button";
import { FunnelSimpleIcon } from "@phosphor-icons/react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Idle toolbar pickers stay muted so only the active ones draw the eye.
export const toolbarTriggerClass = (active: boolean) =>
  active
    ? "border-primary/40 bg-primary/10 hover:bg-primary/15"
    : "font-normal text-muted-foreground hover:text-foreground";

type FiltersTriggerButtonProps = ComponentPropsWithoutRef<typeof Button> & {
  count: number;
};

/**
 * Labeled trigger for a filters menu. Muted when idle; gold tint plus a count
 * pill when the menu holds active filters, matching the toolbar's pickers.
 * Forwards its ref and props so it works under a Radix `asChild` trigger.
 */
export const FiltersTriggerButton = forwardRef<
  HTMLButtonElement,
  FiltersTriggerButtonProps
>(({ count, className, ...props }, ref) => {
  const { t } = useTranslation();

  return (
    <Button
      className={cn("gap-2 px-3", toolbarTriggerClass(count > 0), className)}
      ref={ref}
      variant='outline'
      {...props}>
      <FunnelSimpleIcon className='h-4 w-4 shrink-0' />
      {t("filters.filters")}
      {count > 0 && (
        <span className='rounded-full bg-primary/20 px-1.5 text-[11px] text-primary tabular-nums leading-4'>
          {count}
        </span>
      )}
    </Button>
  );
});
FiltersTriggerButton.displayName = "FiltersTriggerButton";
