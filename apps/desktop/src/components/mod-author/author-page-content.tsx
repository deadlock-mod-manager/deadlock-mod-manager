import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import { SortSelect } from "@/components/mod-browsing/sort-select";
import { useModDetailNavigation } from "@/hooks/use-mod-detail-navigation";
import { useSearchQueryState } from "@/hooks/use-search";
import { modAuthorQueryOptions } from "@/lib/mods/mod-author-query";
import { filterHiddenNSFWItems } from "@/lib/mods/nsfw-visibility";
import { usePersistedStore } from "@/lib/store";
import { sortMods } from "@/lib/utils";
import { AuthorNotFound } from "./author-not-found";
import { AuthorProfileHeader } from "./author-profile-header";

export const AuthorPageContent = ({ authorId }: { authorId: string }) => {
  const { t } = useTranslation();
  const { collection, backLabel, goBack } = useModDetailNavigation();
  const { data: profile } = useSuspenseQuery(modAuthorQueryOptions(authorId));
  const hideNSFW = usePersistedStore((state) => state.nsfwSettings.hideNSFW);
  // The mods store's sort, so an author's mods come in the order the user
  // already browses by.
  const { sortType, setSortType } = useSearchQueryState();

  if (!profile) {
    return <AuthorNotFound backLabel={backLabel} onBack={goBack} />;
  }

  const { author, mods: authorMods } = profile;
  const visibleMods = sortMods(
    filterHiddenNSFWItems(authorMods, hideNSFW) ?? [],
    sortType,
  );
  const displayName = author.name;
  const authorNavigation = { id: authorId, name: displayName };

  return (
    <div className='flex h-full min-h-0 w-full flex-col px-4'>
      <div className='mb-4 flex items-center pt-2'>
        <Button
          className='flex items-center gap-1'
          onClick={goBack}
          size='sm'
          variant='ghost'>
          <ArrowLeft className='h-4 w-4' />
          <span className='max-w-96 truncate' title={backLabel}>
            {backLabel}
          </span>
        </Button>
      </div>

      <div className='min-h-0 flex-1 overflow-auto pb-24'>
        <AuthorProfileHeader author={author} mods={authorMods} />

        <div className='mb-4 flex flex-wrap items-center justify-between gap-4'>
          <h2 className='font-semibold text-xl'>
            {t("authorPage.modsBy", { author: displayName })}
          </h2>
          <div className='flex items-center gap-3'>
            <span
              className='text-muted-foreground text-sm'
              data-testid='author-result-count'>
              {t("authorPage.resultCount", { count: visibleMods.length })}
            </span>
            <SortSelect onChange={setSortType} value={sortType} />
          </div>
        </div>

        <div
          className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
          data-testid='author-mods'>
          {visibleMods.map((mod) => (
            <ModCard
              key={mod.id}
              mod={mod}
              collection={collection}
              author={authorNavigation}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
