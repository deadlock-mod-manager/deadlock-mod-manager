import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useContributors } from "@/hooks/use-contributors";

export const CommunityContributors = () => {
  const { t } = useTranslation();
  const { data: contributors, isPending, isError } = useContributors();

  if (isPending) {
    return (
      <div
        aria-busy='true'
        className='grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {Array.from({ length: 12 }, (_, index) => (
          <div
            className='flex items-center gap-3 border-border/50 border-b px-2 py-3'
            key={index}>
            <Skeleton className='size-10 shrink-0 rounded-full' />
            <div className='flex flex-1 flex-col gap-2'>
              <Skeleton className='h-3.5 w-24' />
              <Skeleton className='h-3 w-16' />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className='rounded-lg border border-border/70 bg-muted/30 p-5'
        role='status'>
        <p className='text-muted-foreground text-sm'>
          {t("contributors.loadFailed")}
        </p>
      </div>
    );
  }

  return (
    <ul className='grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
      {contributors.map((contributor) => (
        <li
          className='min-w-0 border-border/50 border-b'
          key={contributor.login}>
          <button
            aria-label={`${contributor.login}, ${t("contributors.viewOnGithub")}`}
            className='group flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none'
            onClick={() => openUrl(contributor.profileUrl)}
            type='button'>
            <Avatar className='size-10 ring-1 ring-border/60'>
              <AvatarImage alt='' loading='lazy' src={contributor.avatarUrl} />
              <AvatarFallback>{contributor.login.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <span
                className='truncate font-medium text-sm'
                title={contributor.login}>
                {contributor.login}
              </span>
              <span className='text-muted-foreground text-xs tabular-nums'>
                {t("contributors.commitCount", {
                  count: contributor.contributions,
                })}
              </span>
            </div>
            <ArrowUpRightIcon
              aria-hidden
              className='size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
            />
          </button>
        </li>
      ))}
    </ul>
  );
};
