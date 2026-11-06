import { Plus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { PICK_CHIP_CLASS } from "@/components/stats/party/pick-chip";
import { cn } from "@/lib/utils";

/**
 * A free pick slot. Clicking it picks for this player; the active player's
 * first one shows where the next hero goes.
 */
export const OpenPickChip = ({
  isNext,
  onSelect,
}: {
  isNext: boolean;
  onSelect: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      className={cn(
        PICK_CHIP_CLASS,
        "justify-center transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isNext
          ? "border-primary/35 text-muted-foreground"
          : "border-foreground/[0.06] border-dashed text-muted-foreground/60",
      )}
      onClick={onSelect}
      type='button'>
      <Plus
        aria-hidden
        className={cn("h-3.5 w-3.5", isNext && "text-primary")}
      />
      {t("stats.party.pickHero")}
    </button>
  );
};
