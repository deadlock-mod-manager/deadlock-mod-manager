import { Card } from "@deadlock-mods/ui/components/card";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
import { Check } from "@deadlock-mods/ui/icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { MAX_PICKS } from "@/lib/stats/party";
import { cn } from "@/lib/utils";

interface HeroPickerProps {
  heroesById: Map<number, DeadlockHero>;
  /** The player the picker adds heroes for. */
  playerLabel: string;
  selected: number[];
  onToggle: (heroId: number) => void;
}

/** The whole roster as portraits; a click adds or removes a hero for one player. */
export const HeroPicker = ({
  heroesById,
  playerLabel,
  selected,
  onToggle,
}: HeroPickerProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const heroes = useMemo(
    () => [...heroesById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [heroesById],
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? heroes.filter((hero) => hero.name.toLowerCase().includes(needle))
    : heroes;
  const isFull = selected.length >= MAX_PICKS;

  return (
    <Card className='stats-surface flex flex-col gap-3.5 p-5 shadow-none'>
      <div className='flex items-center justify-between'>
        <h2 className='truncate font-semibold text-[15px]'>
          {t("stats.party.picker.title", { player: playerLabel })}
        </h2>
        <span className='shrink-0 font-mono text-[11.5px] text-muted-foreground'>
          {t("stats.party.picker.count", {
            size: selected.length,
            max: MAX_PICKS,
          })}
        </span>
      </div>
      <SearchInput
        className='h-9'
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("stats.party.picker.search")}
        value={query}
      />
      {shown.length === 0 ? (
        <p className='py-6 text-center text-muted-foreground text-xs'>
          {t("stats.party.picker.noMatch", { query: query.trim() })}
        </p>
      ) : (
        <div className='grid max-h-[340px] grid-cols-5 gap-2 overflow-y-auto pr-1'>
          {shown.map((hero) => {
            const isPicked = selected.includes(hero.id);
            return (
              <button
                aria-label={hero.name}
                aria-pressed={isPicked}
                className='relative rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40'
                disabled={isFull && !isPicked}
                key={hero.id}
                onClick={() => onToggle(hero.id)}
                title={hero.name}
                type='button'>
                <HeroAvatar
                  className={cn(
                    "aspect-square h-auto w-full rounded-[10px] border",
                    isPicked
                      ? "border-2 border-primary"
                      : "border-foreground/[0.08] hover:border-foreground/30",
                  )}
                  hero={hero}
                  heroId={hero.id}
                />
                {isPicked && (
                  <span className='absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground'>
                    <Check aria-hidden className='h-2.5 w-2.5' />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className='text-[11.5px] text-muted-foreground'>
        {t("stats.party.picker.hint", { max: MAX_PICKS })}
      </p>
    </Card>
  );
};
