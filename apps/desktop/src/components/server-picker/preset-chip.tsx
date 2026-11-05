import { cn } from "@/lib/utils";
import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { ServerPickerPreset } from "@/types/generated/ServerPickerPreset";

interface PresetChipProps {
  preset: ServerPickerPreset;
  selected: boolean;
  applied: boolean;
  loadDisabled: boolean;
  deleteDisabled: boolean;
  onLoad: () => void;
  onDelete: () => void;
}

export const PresetChip = ({
  preset,
  selected,
  applied,
  loadDisabled,
  deleteDisabled,
  onLoad,
  onDelete,
}: PresetChipProps) => {
  const { t } = useTranslation();
  const count = preset.blockedLocations.length;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border text-xs transition-colors",
        applied
          ? "border-primary bg-primary text-primary-foreground"
          : selected
            ? "border-primary bg-primary/15 text-primary"
            : "border-border bg-secondary/40 text-foreground/85 hover:border-foreground/25 hover:text-foreground",
      )}>
      <button
        type='button'
        aria-pressed={selected}
        disabled={loadDisabled}
        title={t(
          selected && !applied
            ? "serverPicker.presetPending"
            : "serverPicker.presetBlocks",
          { count },
        )}
        className='inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full pl-3 pr-1.5 font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        onClick={onLoad}>
        {applied && <CheckIcon aria-hidden weight='bold' className='size-3' />}
        <span className='max-w-40 truncate'>{preset.name}</span>
        <span
          className={cn(
            "tabular-nums",
            applied
              ? "text-primary-foreground/65"
              : selected
                ? "text-primary/70"
                : "text-muted-foreground",
          )}>
          {count}
        </span>
      </button>
      <button
        type='button'
        disabled={deleteDisabled}
        aria-label={t("serverPicker.deletePreset", { name: preset.name })}
        title={t("serverPicker.deletePreset", { name: preset.name })}
        className={cn(
          "mr-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-full outline-none transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
          applied ? "text-primary-foreground/65" : "text-muted-foreground",
        )}
        onClick={onDelete}>
        <XIcon aria-hidden className='size-3' />
      </button>
    </span>
  );
};
