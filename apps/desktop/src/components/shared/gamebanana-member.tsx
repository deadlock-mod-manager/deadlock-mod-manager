import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GameBananaIcon } from "@/components/shared/gamebanana-logo";
import { useGameBananaMember } from "@/hooks/use-remote-install";
import { cn } from "@/lib/utils";

/** Avatar, name and profile link for a GameBanana member. */
export const GameBananaMemberIdentity = ({
  memberId,
  detail,
  detailClassName,
}: {
  memberId: number;
  detail?: ReactNode;
  detailClassName?: string;
}) => {
  const { t } = useTranslation();
  const { data: member, isLoading } = useGameBananaMember(memberId);
  const profileUrl =
    member?.profileUrl ?? `https://gamebanana.com/members/${memberId}`;

  return (
    <div className='flex min-w-0 items-center gap-3'>
      <Avatar className='size-10 shrink-0 rounded-md'>
        {member?.avatarUrl && <AvatarImage alt='' src={member.avatarUrl} />}
        <AvatarFallback className='rounded-md bg-muted'>
          {isLoading ? (
            <Skeleton className='size-full' />
          ) : (
            <GameBananaIcon className='size-5 text-muted-foreground' />
          )}
        </AvatarFallback>
      </Avatar>
      <div className='min-w-0'>
        <div className='flex min-w-0 items-baseline gap-2'>
          {isLoading ? (
            <Skeleton className='my-0.5 h-4 w-28' />
          ) : (
            <button
              className='inline-flex min-w-0 items-center gap-1 font-medium text-sm hover:underline'
              onClick={() => openUrl(profileUrl)}
              type='button'>
              <span className='truncate'>
                {member?.name ?? t("remoteInstall.memberLabel", { memberId })}
              </span>
              <ArrowSquareOutIcon
                aria-hidden
                className='size-3.5 shrink-0 text-muted-foreground'
              />
            </button>
          )}
          {member && (
            <span className='shrink-0 text-muted-foreground text-xs tabular-nums'>
              #{memberId}
            </span>
          )}
        </div>
        {detail && (
          <p className={cn("text-muted-foreground text-xs", detailClassName)}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
};
