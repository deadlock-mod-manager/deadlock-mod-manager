import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Check, RotateCcw } from "@deadlock-mods/ui/icons";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface OptionSectionProps extends Omit<ComponentProps<"section">, "title"> {
  title: ReactNode;
  summary: ReactNode;
  hint?: ReactNode;
  canReset: boolean;
  canApply: boolean;
  isSaving?: boolean;
  onReset: () => void;
  onApply: () => void;
}

export const OptionSection = ({
  title,
  summary,
  hint,
  canReset,
  canApply,
  isSaving = false,
  onReset,
  onApply,
  children,
  className,
  ...props
}: OptionSectionProps) => {
  const { t } = useTranslation();

  return (
    <section className={cn("space-y-2", className)} {...props}>
      <div className='flex items-baseline justify-between gap-4 px-3'>
        <h3 className='font-medium text-sm'>{title}</h3>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {summary}
        </span>
      </div>
      {children}
      <div className='flex items-center justify-end gap-2 px-3 pt-2'>
        {hint && (
          <span className='mr-auto text-muted-foreground text-xs'>{hint}</span>
        )}
        <Button
          disabled={!canReset}
          icon={<RotateCcw className='h-3.5 w-3.5' />}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          size='sm'
          variant='ghost'>
          {t("installedFiles.reset")}
        </Button>
        <Button
          disabled={!canApply}
          icon={<Check className='h-3.5 w-3.5' />}
          isLoading={isSaving}
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          size='sm'>
          {t("modOptions.apply")}
        </Button>
      </div>
    </section>
  );
};

interface OptionRowProps extends Omit<ComponentProps<"div">, "title"> {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
}

export const OptionRow = ({
  checked,
  disabled = false,
  onToggle,
  title,
  meta,
  aside,
  className,
  ...props
}: OptionRowProps) => (
  <div
    className={cn(
      "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50",
      disabled && "pointer-events-none opacity-50",
      className,
    )}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    {...props}>
    <Checkbox
      checked={checked}
      disabled={disabled}
      onCheckedChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
    <div className='min-w-0 flex-1 space-y-0.5'>
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 text-sm transition-colors",
          !checked && "text-muted-foreground",
        )}>
        {title}
      </div>
      {meta && (
        <div className='truncate text-muted-foreground text-xs'>{meta}</div>
      )}
    </div>
    {aside && (
      <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>
        {aside}
      </span>
    )}
  </div>
);
