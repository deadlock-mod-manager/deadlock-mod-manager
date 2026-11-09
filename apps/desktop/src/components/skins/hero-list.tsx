import { Input } from "@deadlock-mods/ui/components/input";
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type HeroListEntry,
  HeroListRow,
} from "@/components/skins/hero-list-row";

interface HeroListProps {
  /** Heroes with mods first, then the rest. */
  entries: HeroListEntry[];
  selectedHero: string | null;
  onSelect: (hero: string) => void;
}

export const HeroList = ({
  entries,
  selectedHero,
  onSelect,
}: HeroListProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const visible = entries.filter((entry) =>
    entry.hero.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const firstUnmodded = visible.findIndex((entry) => entry.modCount === 0);

  return (
    <div className='flex h-full w-64 shrink-0 flex-col gap-2.5 rounded-xl border bg-card p-2.5'>
      <Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("skins.searchPlaceholder")}
        value={query}
      />
      <div className='flex flex-1 flex-col gap-0.5 overflow-y-auto'>
        {visible.map((entry, index) => (
          <Fragment key={entry.hero}>
            {index === firstUnmodded && index > 0 && (
              <div className='shrink-0 px-2.5 pt-3.5 pb-1.5 font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-[0.07em]'>
                {t("skins.noModsGroup")}
              </div>
            )}
            <HeroListRow
              entry={entry}
              isSelected={entry.hero === selectedHero}
              onSelect={onSelect}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
};
