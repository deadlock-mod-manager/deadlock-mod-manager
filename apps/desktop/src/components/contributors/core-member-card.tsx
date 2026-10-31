import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import {
  type CoreMember,
  githubAvatarUrl,
  githubProfileUrl,
} from "@/lib/contributors";

export const CoreMemberCard = ({ member }: { member: CoreMember }) => {
  const { t } = useTranslation();

  return (
    <button
      aria-label={`${member.name}, ${t("contributors.viewOnGithub")}`}
      className='group flex min-w-0 flex-col gap-5 rounded-xl border border-border/70 bg-muted/30 p-5 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none'
      onClick={() => openUrl(githubProfileUrl(member.login))}
      type='button'>
      <div className='flex w-full items-start justify-between gap-3'>
        <Avatar className='size-16 ring-1 ring-border ring-offset-4 ring-offset-background'>
          <AvatarImage alt='' src={githubAvatarUrl(member.login)} />
          <AvatarFallback className='font-semibold text-xl'>
            {member.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <ArrowUpRightIcon
          aria-hidden
          className='size-4 text-muted-foreground/60 transition-colors group-hover:text-primary group-focus-visible:text-primary motion-reduce:transition-none'
        />
      </div>
      <div className='flex w-full min-w-0 flex-col items-start gap-3'>
        <div className='w-full min-w-0'>
          <div className='truncate font-semibold text-base' title={member.name}>
            {member.name}
          </div>
          <div
            className='mt-1 truncate text-muted-foreground text-xs'
            title={`@${member.login}`}>
            @{member.login}
          </div>
        </div>
        <span className='rounded-md bg-primary/10 px-2 py-1 font-medium text-primary text-xs'>
          {t(`contributors.roles.${member.role}`)}
        </span>
      </div>
    </button>
  );
};
