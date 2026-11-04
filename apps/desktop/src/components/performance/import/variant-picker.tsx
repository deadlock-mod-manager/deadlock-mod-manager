import { pickableVariants } from "@/lib/performance/import/review";
import { cn } from "@/lib/utils";
import type { ImportVariant } from "@/types/generated/ImportVariant";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@deadlock-mods/ui/components/radio-group";
import { useTranslation } from "react-i18next";
import { ArchiveExtrasNote } from "./archive-extras-note";

export const VariantPicker = ({
  title,
  variants,
  value,
  disabled,
  onPick,
  className,
}: {
  title: string;
  variants: ImportVariant[];
  value: string | null;
  disabled?: boolean;
  onPick: (variantPath: string) => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const pickable = pickableVariants(variants);
  if (pickable.length < 2) return <ArchiveExtrasNote variants={variants} />;

  return (
    <div className='flex flex-col gap-2'>
      <span className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
        {title}
      </span>
      <RadioGroup
        // max-content rows: with a capped height the grid would squeeze rows
        // and let wrapped paths overlap the next option.
        className={cn("auto-rows-max gap-1.5", className)}
        disabled={disabled}
        onValueChange={onPick}
        value={value ?? undefined}>
        {pickable.map((variant) => (
          <Label
            className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5'
            key={variant.path}>
            <RadioGroupItem className='mt-0.5 shrink-0' value={variant.path} />
            <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <span className='truncate font-medium text-sm'>
                {variant.label}
              </span>
              <span className='text-muted-foreground text-xs'>
                {t(`performance.import.formats.${variant.format}`)}{" "}
                <span className='break-all font-mono'>({variant.path})</span>
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      <ArchiveExtrasNote variants={variants} />
    </div>
  );
};
