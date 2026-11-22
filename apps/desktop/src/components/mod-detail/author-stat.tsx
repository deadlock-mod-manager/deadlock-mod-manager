import type { ModDto } from "@deadlock-mods/shared";
import { ChevronRight } from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AuthorAvatar } from "@/components/mod-author/author-avatar";
import { VerifiedSeal } from "@/components/mod-author/verified-author-badge";
import { useCommissionAuthor } from "@/hooks/use-commission-author";
import { modAuthorQueryOptions } from "@/lib/mods/mod-author-query";
import { cn } from "@/lib/utils";

interface AuthorStatProps {
  authorId: string;
  mod: ModDto;
  onSelect: () => void;
}

export const AuthorStat = ({ authorId, mod, onSelect }: AuthorStatProps) => {
  const { t } = useTranslation();
  // Shares the author page's cache, so opening the profile is usually instant.
  // The avatar is decoration here, so a failed lookup stays silent.
  const { data: profile } = useQuery({
    ...modAuthorQueryOptions(authorId),
    meta: { skipGlobalErrorHandler: true },
    retry: 1,
  });
  const verified = useCommissionAuthor(profile?.author) !== null;
  const profileLabel = t("authorPage.viewProfile");

  return (
    <button
      aria-label={`${profileLabel}: ${mod.author}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        verified && "border-primary/30 bg-primary/5 hover:bg-primary/10",
      )}
      onClick={onSelect}
      type='button'>
      <AuthorAvatar
        author={profile?.author}
        mods={profile?.mods ?? [mod]}
        name={mod.author}
        size='sm'
      />
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='text-muted-foreground text-xs uppercase tracking-wide'>
          {t("modDetail.authorLabel")}
        </span>
        <span className='flex min-w-0 items-center gap-1.5'>
          <span className='truncate font-medium text-foreground text-sm'>
            {mod.author}
          </span>
          {verified && <VerifiedSeal />}
        </span>
      </span>
      <span className='flex shrink-0 items-center gap-1 text-muted-foreground text-xs transition-colors group-hover:text-foreground'>
        {profileLabel}
        <ChevronRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
      </span>
    </button>
  );
};
