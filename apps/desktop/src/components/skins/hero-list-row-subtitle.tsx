import { Shuffle, TriangleAlert } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import type { HeroListEntry } from "@/components/skins/hero-list-row";

export const HeroListRowSubtitle = ({ entry }: { entry: HeroListEntry }) => {
  const { t } = useTranslation();

  if (entry.conflicted) {
    return (
      <span className='flex min-w-0 items-center gap-1 text-signal-poor'>
        <TriangleAlert className='h-3 w-3 shrink-0' />
        <span className='truncate'>
          {t("skins.conflictCount", { count: entry.wearing.length })}
        </span>
      </span>
    );
  }
  if (entry.randomized) {
    return (
      <span className='flex min-w-0 items-center gap-1 text-secondary-foreground'>
        <Shuffle className='h-3 w-3 shrink-0' />
        <span className='truncate'>{t("skins.randomizer.listSubtitle")}</span>
      </span>
    );
  }
  return (
    <span className='block truncate text-muted-foreground'>
      {entry.wearing.length > 0 ? entry.wearing.join(", ") : t("skins.default")}
    </span>
  );
};
