import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { FoundryPaintPart } from "@/types/foundry";
import { Swatch } from "./foundry-paint-swatch";

export const SectionRow = ({
  part,
  selected,
  hidden,
  appliedColor,
  pendingColor,
  onReset,
  onToggle,
  onToggleHidden,
}: {
  part: FoundryPaintPart;
  selected: boolean;
  hidden: boolean;
  appliedColor: string | undefined;
  /** A color picked for this section but not painted yet. */
  pendingColor: string | undefined;
  /** Restores the section's original color map; absent while it is unedited. */
  onReset: (() => void) | undefined;
  onToggle: () => void;
  onToggleHidden: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-md border px-2 py-[7px] transition-colors",
        selected
          ? "border-primary/25 bg-primary/[0.07]"
          : "border-transparent hover:bg-muted",
      )}>
      <button
        aria-pressed={selected}
        className='flex min-w-0 flex-1 items-center gap-2.5 text-left'
        onClick={onToggle}
        title={part.materials.join("\n")}
        type='button'>
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px]",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50",
          )}>
          {selected && (
            <CheckIcon className='h-[11px] w-[11px]' weight='bold' />
          )}
        </span>
        <span className='flex min-w-0 flex-col'>
          <span
            className={cn(
              "truncate text-[13px]",
              selected && "font-semibold",
              hidden && "text-muted-foreground",
            )}>
            {part.label}
          </span>
          {hidden && (
            <span className='text-[10px] text-muted-foreground/70'>
              {t("foundry.paint.hiddenMeta")}
            </span>
          )}
        </span>
      </button>
      {onReset && (
        <button
          aria-label={t("foundry.paint.resetPart", { part: part.label })}
          className='shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100'
          onClick={onReset}
          title={t("foundry.paint.resetPart", { part: part.label })}
          type='button'>
          <ArrowCounterClockwiseIcon className='h-[14px] w-[14px]' />
        </button>
      )}
      <button
        aria-label={t(
          hidden ? "foundry.paint.showPart" : "foundry.paint.hidePart",
        )}
        className={cn(
          "shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
          hidden ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={onToggleHidden}
        title={t(hidden ? "foundry.paint.showPart" : "foundry.paint.hidePart")}
        type='button'>
        {hidden ? (
          <EyeSlashIcon className='h-[15px] w-[15px]' />
        ) : (
          <EyeIcon className='h-[15px] w-[15px]' />
        )}
      </button>
      {pendingColor ? (
        <span title={t("foundry.paint.pendingPart")}>
          <Swatch
            className='border-dashed border-foreground/60'
            color={pendingColor}
          />
        </span>
      ) : (
        appliedColor && <Swatch color={appliedColor} />
      )}
    </div>
  );
};
