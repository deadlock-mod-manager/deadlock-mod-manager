import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Input } from "@deadlock-mods/ui/components/input";
import { TriangleAlert } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useHero } from "@/hooks/use-hero";
import { cn } from "@/lib/utils";

export interface HeroListEntry {
  hero: string;
  skinCount: number;
  activeNames: string[];
  conflicted: boolean;
}

interface HeroListRowProps {
  entry: HeroListEntry;
  isSelected: boolean;
  onSelect: (hero: string) => void;
}

const HeroListRow = ({ entry, isSelected, onSelect }: HeroListRowProps) => {
  const { t } = useTranslation();
  const { data: hero } = useHero(entry.hero);
  const heroImage =
    hero?.images.icon_image_small_webp ?? hero?.images.icon_image_small;

  const subtitle = entry.conflicted
    ? t("skins.conflict")
    : (entry.activeNames[0] ?? t("skins.default"));

  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent",
        isSelected && "bg-accent",
      )}
      onClick={() => onSelect(entry.hero)}
      type='button'>
      <Avatar
        className={cn(
          "h-9 w-9",
          // Dim only the portrait so heroes without skins still read as
          // selectable rows.
          entry.skinCount === 0 && "opacity-50 grayscale",
        )}>
        {heroImage && <AvatarImage alt={entry.hero} src={heroImage} />}
        <AvatarFallback>{entry.hero.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1'>
        <div className='truncate font-medium text-sm'>{entry.hero}</div>
        <div
          className={cn(
            "flex items-center gap-1 text-muted-foreground text-xs",
            entry.conflicted && "text-destructive",
          )}>
          {entry.conflicted && <TriangleAlert className='h-3 w-3 shrink-0' />}
          <span className='truncate'>
            {entry.skinCount === 0 ? t("skins.noSkins") : subtitle}
          </span>
        </div>
      </div>
      {entry.skinCount > 0 && (
        <span className='shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums'>
          <span className='sr-only'>
            {t("skins.skinCount", { count: entry.skinCount })}
          </span>
          <span aria-hidden='true'>{entry.skinCount}</span>
        </span>
      )}
    </button>
  );
};

interface HeroListProps {
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

  return (
    <div className='flex h-full w-64 shrink-0 flex-col gap-2'>
      <Input
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("skins.searchPlaceholder")}
        value={query}
      />
      <div className='flex-1 overflow-y-auto'>
        {visible.map((entry) => (
          <HeroListRow
            entry={entry}
            isSelected={entry.hero === selectedHero}
            key={entry.hero}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
};
