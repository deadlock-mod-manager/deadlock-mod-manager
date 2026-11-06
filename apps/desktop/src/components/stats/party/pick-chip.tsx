import { X } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { LOSS_COLOR, tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { cn } from "@/lib/utils";

export const PICK_CHIP_CLASS =
  "flex h-[42px] w-[136px] items-center gap-2 rounded-[9px] border text-[12.5px]";

interface PickChipProps {
  heroId: number;
  hero: DeadlockHero | undefined;
  /** Marked as the pick the party would do better without. */
  isWeakest: boolean;
  /** Just placed by a suggested swap; glows once so the eye finds it. */
  isLanded: boolean;
  onRemove: () => void;
}

export const PickChip = ({
  heroId,
  hero,
  isWeakest,
  isLanded,
  onRemove,
}: PickChipProps) => {
  const { t } = useTranslation();
  const name = hero?.name ?? `#${heroId}`;
  return (
    <span
      className={cn(
        PICK_CHIP_CLASS,
        "border-foreground/[0.06] bg-background py-1 pr-2 pl-1",
        isLanded && "party-chip-land",
      )}
      style={isWeakest ? { borderColor: tint(LOSS_COLOR, 45) } : undefined}>
      <HeroAvatar
        className='h-[30px] w-[30px] rounded-[7px]'
        hero={hero}
        heroId={heroId}
      />
      <span className='min-w-0 flex-1 truncate font-semibold'>{name}</span>
      <button
        aria-label={t("stats.party.remove", { hero: name })}
        className='rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onClick={onRemove}
        type='button'>
        <X aria-hidden className='h-3 w-3' />
      </button>
    </span>
  );
};
