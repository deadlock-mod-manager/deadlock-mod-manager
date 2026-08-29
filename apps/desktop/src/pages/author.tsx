import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Heart,
  Package,
} from "@deadlock-mods/ui/icons";
import { UserCircle } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Suspense, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router";
import ModCard from "@/components/mod-browsing/mod-card";
import ModCardSkeleton from "@/components/skeletons/mod-card";
import ErrorBoundary from "@/components/shared/error-boundary";
import { getMods } from "@/lib/api-client";
import {
  type AuthorModDetailBackNavigation,
  type CollectionModDetailBackNavigation,
  type ModDetailNavigationState,
  resolveAuthorProfileBackNavigation,
} from "@/lib/mods/mod-detail-navigation";
import { STALE_TIME_API } from "@/lib/query-constants";
import { isTrustedExternalUrl } from "@/lib/trusted-external-url";

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

const AuthorNotFound = ({
  backLabel,
  onBack,
}: {
  backLabel: string;
  onBack: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Empty className='py-16'>
      <EmptyHeader>
        <EmptyMedia variant='default'>
          <UserCircle className='h-16 w-16' />
        </EmptyMedia>
        <EmptyTitle>{t("authorPage.notFoundTitle")}</EmptyTitle>
        <EmptyDescription>
          {t("authorPage.notFoundDescription")}
        </EmptyDescription>
        <Button className='mt-4' onClick={onBack} variant='outline'>
          <ArrowLeft className='h-4 w-4' />
          {backLabel}
        </Button>
      </EmptyHeader>
    </Empty>
  );
};

const AuthorPageContent = ({
  authorId,
  authorName,
  backNavigation,
  backLabel,
}: {
  authorId?: number;
  authorName?: string;
  backNavigation: CollectionModDetailBackNavigation;
  backLabel: string;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: mods } = useSuspenseQuery({
    queryKey: ["mods"],
    queryFn: getMods,
    staleTime: STALE_TIME_API,
    retry: 3,
  });

  const authorMods = useMemo(
    () =>
      mods.filter((mod) =>
        authorId === undefined
          ? mod.author === authorName
          : mod.metadata?.author?.id === authorId,
      ),
    [authorId, authorName, mods],
  );
  const author = authorMods[0]?.metadata?.author;
  const displayName = authorMods[0]?.author;
  const headerImage = authorMods.find(
    (mod) => !mod.isNSFW && mod.images.length > 0,
  )?.images[0];
  const totals = useMemo(() => {
    let downloads = 0;
    let likes = 0;
    for (const mod of authorMods) {
      downloads += mod.downloadCount;
      likes += mod.likes;
    }
    return { downloads, likes };
  }, [authorMods]);

  const goBack = useCallback(
    () => navigate(backNavigation.path),
    [backNavigation.path, navigate],
  );

  if (!displayName) {
    return <AuthorNotFound backLabel={backLabel} onBack={goBack} />;
  }

  const avatarUrl = author
    ? author.hdAvatarUrl || author.upicUrl || author.avatarUrl
    : undefined;
  const canOpenProfile = isTrustedExternalUrl(author?.profileUrl);
  const authorPath =
    authorId === undefined
      ? `/authors/by-name/${encodeURIComponent(displayName)}`
      : `/authors/${authorId}`;
  const detailBackNavigation: AuthorModDetailBackNavigation = {
    kind: "author",
    authorName: displayName,
    path: authorPath,
  };

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
        <section className='relative mb-6 min-h-48 overflow-hidden rounded-lg border bg-card'>
          {headerImage && (
            <img
              alt=''
              aria-hidden='true'
              className='absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_right,transparent_0%,black_45%,black_100%)]'
              src={headerImage}
            />
          )}
          <div className='relative flex min-h-48 items-end gap-5 bg-gradient-to-t from-background via-background/85 to-background/20 p-6'>
            <Avatar className='h-24 w-24 border-2 border-background shadow-lg'>
              <AvatarImage alt={displayName} src={avatarUrl} />
              <AvatarFallback className='text-xl'>
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 flex-1 pb-1'>
              <p className='mb-1 text-muted-foreground text-sm'>
                {t("authorPage.submittedBy")}
              </p>
              <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
                <h1 className='truncate font-semibold text-3xl tracking-tight'>
                  {displayName}
                </h1>
                {author?.title && (
                  <span className='rounded-full bg-muted px-2.5 py-1 text-muted-foreground text-xs'>
                    {author.title}
                  </span>
                )}
              </div>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <AuthorStatPill
                  icon={<Package className='h-3.5 w-3.5' />}
                  label={t("authorPage.modStat", {
                    count: authorMods.length,
                  })}
                  value={authorMods.length.toLocaleString()}
                />
                <AuthorStatPill
                  icon={<Download className='h-3.5 w-3.5' />}
                  label={t("authorPage.downloadStat", {
                    count: totals.downloads,
                  })}
                  value={totals.downloads.toLocaleString()}
                />
                <AuthorStatPill
                  icon={<Heart className='h-3.5 w-3.5' />}
                  label={t("authorPage.likeStat", { count: totals.likes })}
                  value={totals.likes.toLocaleString()}
                />
              </div>
            </div>
            {canOpenProfile && (
              <Button
                className='shrink-0'
                onClick={() => author && void openUrl(author.profileUrl)}
                variant='outline'>
                {t("authorPage.viewOnGameBanana")}
                <ExternalLink className='h-4 w-4' />
              </Button>
            )}
          </div>
        </section>

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
              authorProfileBackNavigation={backNavigation}
              detailBackNavigation={detailBackNavigation}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const AuthorStatPill = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <span className='inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/65 px-2.5 py-1 text-xs shadow-sm'>
    <span className='text-muted-foreground'>{icon}</span>
    <span className='font-semibold tabular-nums text-foreground'>{value}</span>
    <span className='text-muted-foreground'>{label}</span>
  </span>
);

const AuthorPageSkeleton = () => (
  <div className='flex h-full min-h-0 w-full flex-col px-4 pt-14'>
    <div className='mb-6 h-48 animate-pulse rounded-lg border bg-muted' />
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
      {Array.from({ length: 12 }, (_, index) => (
        <ModCardSkeleton key={index} />
      ))}
    </div>
  </div>
);

const Author = () => {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const navigationState: ModDetailNavigationState | null = location.state;
  const backNavigation = resolveAuthorProfileBackNavigation(navigationState);
  const backLabel =
    backNavigation.kind === "library"
      ? t("authorPage.backToLibrary")
      : backNavigation.kind === "favorites"
        ? t("authorPage.backToFavorites")
        : backNavigation.kind === "dashboard"
          ? t("authorPage.backToDashboard")
          : t("authorPage.backToMods");
  const authorId = Number(params.id);
  const authorName = params.name?.trim();
  const goBack = useCallback(
    () => navigate(backNavigation.path),
    [backNavigation.path, navigate],
  );

  const hasValidAuthorId = Number.isSafeInteger(authorId) && authorId > 0;

  if (!authorName && !hasValidAuthorId) {
    return <AuthorNotFound backLabel={backLabel} onBack={goBack} />;
  }

  return (
    <Suspense fallback={<AuthorPageSkeleton />}>
      <ErrorBoundary>
        <AuthorPageContent
          authorId={hasValidAuthorId ? authorId : undefined}
          authorName={authorName}
          backLabel={backLabel}
          backNavigation={backNavigation}
        />
      </ErrorBoundary>
    </Suspense>
  );
};

export default Author;
