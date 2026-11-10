import { ChartBarIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { RECENT_MATCH_MONTHS } from "@/lib/server-picker";
import { cn } from "@/lib/utils";

interface PlayedPresetChipProps {
  blockedLocations: string[];
  selected: boolean;
  disabled: boolean;
  onLoad: () => void;
}

/** Built-in preset from match history: keeps only locations the player used. */
export const PlayedPresetChip = ({
  blockedLocations,
  selected,
  disabled,
  onLoad,
}: PlayedPresetChipProps) => {
  const { t } = useTranslation();
  return (
    <button
      type='button'
      aria-pressed={selected}
      disabled={disabled}
      title={t("serverPicker.playedPresetHint", {
        months: RECENT_MATCH_MONTHS,
      })}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/40 text-foreground/85 hover:border-foreground/25 hover:text-foreground",
      )}
      onClick={onLoad}>
      <ChartBarIcon aria-hidden className='size-3' />
      {t("serverPicker.playedPreset")}
      <span
        className={cn(
          "tabular-nums",
          selected ? "text-primary/70" : "text-muted-foreground",
        )}>
        {blockedLocations.length}
      </span>
    </button>
  );
};
