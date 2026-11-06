import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowRightLeft, Trash2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { OpenPickChip } from "@/components/stats/party/open-pick-chip";
import { PickChip } from "@/components/stats/party/pick-chip";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatDecimal } from "@/lib/stats/format";
import { MAX_PICKS, type PickAdvice } from "@/lib/stats/party";
import { cn } from "@/lib/utils";

interface PartyMemberRowProps {
  label: string;
  picks: number[];
  heroesById: Map<number, DeadlockHero>;
  isActive: boolean;
  advice: PickAdvice | null;
  /** The hero a suggested swap just placed for this player. */
  landedHeroId: number | null;
  canRemove: boolean;
  onSelect: () => void;
  onRemovePick: (heroId: number) => void;
  onApplyAdvice: (advice: PickAdvice) => void;
  onRemove: () => void;
}

/** One player in the party: the heroes they offer, and the change that helps most. */
export const PartyMemberRow = ({
  label,
  picks,
  heroesById,
  isActive,
  advice,
  landedHeroId,
  canRemove,
  onSelect,
  onRemovePick,
  onApplyAdvice,
  onRemove,
}: PartyMemberRowProps) => {
  const { t } = useTranslation();
  const nameOf = (heroId: number) =>
    heroesById.get(heroId)?.name ?? `#${heroId}`;
  const points = advice ? formatDecimal(advice.gain * 100, 1) : "";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[11px] border px-3.5 py-3 transition-colors",
        isActive
          ? "border-primary/25 bg-primary/[0.04]"
          : "border-foreground/[0.04] hover:border-foreground/10",
      )}>
      <div className='flex flex-wrap items-center gap-4'>
        <button
          aria-pressed={isActive}
          className='flex w-24 flex-col items-start gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          onClick={onSelect}
          type='button'>
          <span className='font-semibold text-[13px]'>{label}</span>
          <span
            className={cn(
              "text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground",
            )}>
            {isActive
              ? t("stats.party.member.active")
              : t("stats.party.member.picks", {
                  size: picks.length,
                  max: MAX_PICKS,
                })}
          </span>
        </button>
        <div className='flex flex-1 flex-wrap gap-2'>
          {picks.map((heroId) => (
            <PickChip
              hero={heroesById.get(heroId)}
              heroId={heroId}
              isLanded={landedHeroId === heroId}
              isWeakest={advice?.replace === heroId}
              key={heroId}
              onRemove={() => onRemovePick(heroId)}
            />
          ))}
          {Array.from({ length: MAX_PICKS - picks.length }, (_, index) => (
            <OpenPickChip
              isNext={isActive && index === 0}
              onSelect={onSelect}
              // Open slots carry nothing but their position.
              key={`open-${picks.length + index}`}
            />
          ))}
        </div>
        {canRemove && (
          <Button
            aria-label={t("stats.party.member.remove", { player: label })}
            className='h-8 w-8 text-muted-foreground'
            onClick={onRemove}
            size='icon'
            variant='ghost'>
            <Trash2 aria-hidden className='h-3.5 w-3.5' />
          </Button>
        )}
      </div>
      {advice && (
        <div className='flex flex-wrap items-center gap-2 pl-28 text-[11.5px] text-muted-foreground'>
          <ArrowRightLeft aria-hidden className='h-3.5 w-3.5 text-primary' />
          <span>
            {advice.replace === null
              ? t("stats.party.advice.add", {
                  hero: nameOf(advice.heroId),
                  points,
                })
              : t("stats.party.advice.swap", {
                  pick: nameOf(advice.replace),
                  hero: nameOf(advice.heroId),
                  points,
                })}
          </span>
          <Button
            className='h-6 rounded-md border-primary/25 px-2 font-semibold text-[11.5px] text-primary'
            onClick={() => onApplyAdvice(advice)}
            size='sm'
            variant='outline'>
            {advice.replace === null
              ? t("stats.party.advice.addAction")
              : t("stats.party.advice.swapAction")}
          </Button>
        </div>
      )}
    </div>
  );
};
