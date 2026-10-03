import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ModCard from "@/components/mod-browsing/mod-card";
import { useModDetailNavigation } from "@/hooks/use-mod-detail-navigation";
import { getModAuthor } from "@/lib/api-client";
import { returnNullForNotFound } from "@/lib/http-error";
import { STALE_TIME_API } from "@/lib/query-constants";
import { AuthorNotFound } from "./author-not-found";
import { AuthorProfileHeader } from "./author-profile-header";

export const AuthorPageContent = ({ authorId }: { authorId: string }) => {
  const { t } = useTranslation();
  const { collection, backLabel, goBack } = useModDetailNavigation();
  const { data: profile } = useSuspenseQuery({
    queryKey: ["mod-author", authorId],
    queryFn: () => getModAuthor(authorId).catch(returnNullForNotFound),
    staleTime: STALE_TIME_API,
    retry: 3,
  });

  if (!profile) {
    return <AuthorNotFound backLabel={backLabel} onBack={goBack} />;
  }

  const { author, mods: authorMods } = profile;
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

        <div className='mb-4 flex items-baseline justify-between gap-4'>
          <h2 className='font-semibold text-xl'>
            {t("authorPage.modsBy", { author: displayName })}
          </h2>
          <span className='text-muted-foreground text-sm'>
            {t("authorPage.resultCount", { count: authorMods.length })}
          </span>
        </div>

        <div className='grid grid-cols-1 gap-4 px-1 pr-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
          {authorMods.map((mod) => (
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
