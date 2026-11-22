import { useTranslation } from "react-i18next";
import { HeroIcon } from "@/components/heroes/hero-icon";
import { HeroListRowSubtitle } from "@/components/skins/hero-list-row-subtitle";
import { cn } from "@/lib/utils";

export interface HeroListEntry {
  hero: string;
  /** Skins, sounds and extras together: everything listed under the hero. */
  modCount: number;
  /** Names of the installed skins; empty while the hero wears the default. */
  wearing: string[];
  /** The skin is rolled on launch, so the row names no skin. */
  randomized: boolean;
  conflicted: boolean;
}

interface HeroListRowProps {
  entry: HeroListEntry;
  isSelected: boolean;
  onSelect: (hero: string) => void;
}

export const HeroListRow = ({
  entry,
  isSelected,
  onSelect,
}: HeroListRowProps) => {
  const { t } = useTranslation();
  const modded = entry.modCount > 0;

  return (
    <button
      className={cn(
        "relative flex w-full shrink-0 items-center gap-2.5 rounded-lg py-1.5 pr-2.5 pl-2 text-left transition-colors hover:bg-accent",
        !modded && "py-1",
        isSelected &&
          "bg-accent before:absolute before:top-[11px] before:bottom-[11px] before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
      )}
      onClick={() => onSelect(entry.hero)}
      type='button'>
      <HeroIcon
        className={cn(
          "h-[34px] w-[34px] rounded-lg",
          // Dim only the portrait so heroes without mods still read as
          // selectable rows.
          !modded && "mx-[3px] h-7 w-7 opacity-45 grayscale",
          !modded && isSelected && "opacity-100 grayscale-0",
        )}
        hero={entry.hero}
      />
      <div className='min-w-0 flex-1'>
        <div
          className={cn(
            "truncate font-medium text-sm",
            !modded && !isSelected && "font-normal text-muted-foreground",
          )}>
          {entry.hero}
        </div>
        {modded && (
          <div className='mt-px text-xs'>
            <HeroListRowSubtitle entry={entry} />
          </div>
        )}
      </div>
      {modded && (
        <span className='shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-medium font-mono text-[11px] text-muted-foreground tabular-nums'>
          <span className='sr-only'>
            {t("skins.modCount", { count: entry.modCount })}
          </span>
          <span aria-hidden='true'>{entry.modCount}</span>
        </span>
      )}
    </button>
  );
};
