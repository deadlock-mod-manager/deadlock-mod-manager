import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { GithubLogoIcon, HeartIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import PageTitle from "@/components/shared/page-title";
import { useContributors } from "@/hooks/use-contributors";
import { GITHUB_REPO } from "@/lib/constants";
import {
  CORE_TEAM,
  type CoreMember,
  githubAvatarUrl,
  githubProfileUrl,
} from "@/lib/contributors";

const CoreMemberCard = ({ member }: { member: CoreMember }) => {
  const { t } = useTranslation();

  return (
    <button
      className='group flex flex-col items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-6 text-center transition-colors hover:border-primary/40 hover:bg-card'
      onClick={() => openUrl(githubProfileUrl(member.login))}
      type='button'>
      <Avatar className='size-20 ring-2 ring-border transition-[box-shadow] group-hover:ring-primary/60'>
        <AvatarImage alt={member.name} src={githubAvatarUrl(member.login)} />
        <AvatarFallback className='font-semibold text-xl'>
          {member.name.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className='flex flex-col gap-1'>
        <span className='font-primary text-lg leading-none'>{member.name}</span>
        <span className='text-muted-foreground text-xs'>@{member.login}</span>
      </div>
      <span className='rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs'>
        {t(`contributors.roles.${member.role}`)}
      </span>
    </button>
  );
};

const CommunityContributors = () => {
  const { t } = useTranslation();
  const { data: contributors, isPending, isError } = useContributors();

  if (isPending) {
    return (
      <div className='grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2'>
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton className='h-14 rounded-lg' key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className='flex flex-col items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-4'>
        <p className='text-muted-foreground text-sm'>
          {t("contributors.loadFailed")}
        </p>
        <Button
          onClick={() => openUrl(`${GITHUB_REPO}/graphs/contributors`)}
          size='sm'
          variant='outline'>
          <GithubLogoIcon className='size-4' />
          {t("contributors.viewOnGithub")}
        </Button>
      </div>
    );
  }

  return (
    <div className='grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2'>
      {contributors.map((contributor) => (
        <button
          className='flex min-w-0 items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card'
          key={contributor.login}
          onClick={() => openUrl(contributor.profileUrl)}
          type='button'>
          <Avatar className='size-9'>
            <AvatarImage alt={contributor.login} src={contributor.avatarUrl} />
            <AvatarFallback>{contributor.login.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className='flex min-w-0 flex-col'>
            <span className='truncate font-medium text-sm'>
              {contributor.login}
            </span>
            <span className='text-muted-foreground text-xs tabular-nums'>
              {t("contributors.commitCount", {
                count: contributor.contributions,
              })}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
};

const Contributors = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <div className='flex shrink-0 items-center px-4 pt-2'>
        <Button
          className='flex items-center gap-1'
          onClick={goBack}
          size='sm'
          variant='ghost'>
          <ArrowLeft className='h-4 w-4' />
          {t("contributors.back")}
        </Button>
      </div>
      <PageTitle
        className='shrink-0 px-4'
        subtitle={t("contributors.subtitle")}
        title={t("contributors.title")}
      />
      <div className='min-h-0 flex-1 overflow-y-auto px-4 py-6'>
        <div className='flex max-w-5xl flex-col gap-10'>
          <section className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h2 className='font-semibold text-lg'>
                {t("contributors.coreTeam")}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {t("contributors.coreTeamDescription")}
              </p>
            </div>
            <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
              {CORE_TEAM.map((member) => (
                <CoreMemberCard key={member.login} member={member} />
              ))}
            </div>
          </section>

          <section className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h2 className='font-semibold text-lg'>
                {t("contributors.community")}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {t("contributors.communityDescription")}
              </p>
            </div>
            <CommunityContributors />
          </section>

          <section className='flex items-start gap-3 rounded-xl border border-border/50 bg-card/50 p-5'>
            <HeartIcon
              className='mt-0.5 size-5 shrink-0 text-primary'
              weight='fill'
            />
            <div className='flex flex-col gap-1'>
              <h2 className='font-semibold'>{t("contributors.thanksTitle")}</h2>
              <p className='text-muted-foreground text-sm'>
                {t("contributors.thanksDescription")}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Contributors;
