import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { GameBananaMarkup } from "@/components/mod-detail/gamebanana-markup";
import type { CatalogChangelogEntryDto } from "@/types/generated/CatalogChangelogEntryDto";

// GameBanana lets authors pick free-form labels, so match loosely and fall
// back to a neutral badge for anything unrecognized.
const categoryTone = (category: string) => {
  const label = category.toLowerCase();
  if (label.includes("fix")) return "border-red-500/40 text-red-500";
  if (label.includes("remov")) return "border-amber-500/40 text-amber-500";
  if (/(add|feature|new)/.test(label))
    return "border-emerald-500/40 text-emerald-500";
  if (/(improve|adjust|tweak|optimi|change|overhaul)/.test(label))
    return "border-blue-500/40 text-blue-500";
  return "text-muted-foreground";
};

export const isPublishedAfter = (
  entry: CatalogChangelogEntryDto,
  date: Date | undefined,
) => !!date && entry.publishedAt * 1000 > date.getTime();

interface ChangelogEntryProps {
  entry: CatalogChangelogEntryDto;
  isNew?: boolean;
  className?: string;
}

export const ChangelogEntry = ({
  entry,
  isNew = false,
  className,
}: ChangelogEntryProps) => {
  const { t } = useTranslation();

  return (
    <article className={cn("space-y-2", className)}>
      <header className='flex flex-wrap items-center gap-2'>
        {entry.version && (
          <Badge className='font-mono' variant='secondary'>
            v{entry.version}
          </Badge>
        )}
        {entry.title && (
          <span className='font-medium text-sm'>{entry.title}</span>
        )}
        {isNew && <Badge>{t("modDetail.changelog.newSinceInstall")}</Badge>}
        <DateDisplay
          className='ml-auto text-muted-foreground text-xs'
          date={new Date(entry.publishedAt * 1000)}
        />
      </header>
      {entry.changes.length > 0 && (
        <ul className='space-y-1.5'>
          {entry.changes.map((change) => (
            <li
              className='flex items-start gap-2 text-sm'
              key={`${change.category ?? ""}:${change.text}`}>
              {change.category && (
                <Badge
                  className={cn(
                    "mt-0.5 shrink-0",
                    categoryTone(change.category),
                  )}
                  variant='outline'>
                  {change.category}
                </Badge>
              )}
              <span className='leading-relaxed'>{change.text}</span>
            </li>
          ))}
        </ul>
      )}
      {entry.text && <GameBananaMarkup content={entry.text} />}
    </article>
  );
};
