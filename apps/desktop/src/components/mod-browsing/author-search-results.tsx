import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { AuthorAvatar } from "@/components/mod-author/author-avatar";
import { searchGameBananaCatalogAuthors } from "@/lib/gamebanana-catalog";
import { modAuthorQueryOptions } from "@/lib/mods/mod-author-query";
import type { ModsCollection } from "@/lib/mods/mod-detail-navigation";
import { MODS_LIST_QUERY_KEY } from "@/lib/mods/mod-query-cache";
import { STALE_TIME_API } from "@/lib/query-constants";
import type { CatalogAuthor } from "@/types/generated/CatalogAuthor";
import type { CatalogQuery } from "@/types/generated/CatalogQuery";

type AuthorSearchResultsProps = {
  query: CatalogQuery;
  collection: ModsCollection;
};

/** Authors whose name matches the store search, linking to their profiles. */
export const AuthorSearchResults = ({
  query,
  collection,
}: AuthorSearchResultsProps) => {
  const { t } = useTranslation();
  const { data: authors } = useQuery({
    queryKey: [...MODS_LIST_QUERY_KEY, "gamebanana-authors", query],
    queryFn: () => searchGameBananaCatalogAuthors(query),
    enabled: query.search.trim() !== "",
    staleTime: STALE_TIME_API,
  });

  if (!authors?.length) return null;

  return (
    <section
      aria-label={t("mods.authorResults")}
      className='flex flex-wrap items-center gap-2'>
      <span className='text-muted-foreground text-sm'>
        {t("mods.authorResults")}
      </span>
      {authors.map((author) => (
        <AuthorResult
          author={author}
          collection={collection}
          key={author.authorRemoteId}
        />
      ))}
    </section>
  );
};

const AuthorResult = ({
  author,
  collection,
}: {
  author: CatalogAuthor;
  collection: ModsCollection;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const authorId = `gamebanana:${author.authorRemoteId}`;
  // The catalog has no avatars, so each shown author loads the same profile
  // the author page reads. Opening it afterwards is then instant.
  const { data: profile } = useQuery({
    ...modAuthorQueryOptions(authorId),
    retry: 1,
  });

  return (
    <button
      className='flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-left outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring'
      onClick={() =>
        navigate(`/authors/${authorId}`, { state: { collection } })
      }
      title={t("mods.showMoreByAuthor", { author: author.name })}
      type='button'>
      <AuthorAvatar
        author={profile?.author}
        mods={profile?.mods}
        name={author.name}
        size='sm'
      />
      <span className='font-medium text-sm'>{author.name}</span>
      <span className='text-muted-foreground text-xs tabular-nums'>
        {t("authorPage.resultCount", { count: author.submissionCount })}
      </span>
    </button>
  );
};
