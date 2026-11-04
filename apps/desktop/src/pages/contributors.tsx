import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import {
  ArrowUpRightIcon,
  GithubLogoIcon,
  HeartIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CommunityContributors } from "@/components/contributors/community-contributors";
import { CoreMemberCard } from "@/components/contributors/core-member-card";
import { GITHUB_REPO } from "@/lib/constants";
import { CORE_TEAM } from "@/lib/contributors";

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
    <div className='h-full min-h-0 w-full overflow-y-auto'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-4 pb-12 lg:px-10 lg:pt-6'>
        <header>
          <Button
            className='-ml-3 mb-6 gap-2 text-muted-foreground'
            onClick={goBack}
            size='sm'
            variant='ghost'>
            <ArrowLeft aria-hidden className='size-4' />
            {t("contributors.back")}
          </Button>
          <h1 className='font-primary font-bold text-3xl tracking-tight'>
            {t("contributors.title")}
          </h1>
          <p className='mt-3 max-w-2xl text-muted-foreground text-sm leading-relaxed'>
            {t("contributors.subtitle")}
          </p>
        </header>

        <section
          aria-labelledby='core-team-heading'
          className='flex flex-col gap-5'>
          <div className='flex flex-col gap-1.5'>
            <h2 className='font-semibold text-lg' id='core-team-heading'>
              {t("contributors.coreTeam")}
            </h2>
            <p className='text-muted-foreground text-sm leading-relaxed'>
              {t("contributors.coreTeamDescription")}
            </p>
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {CORE_TEAM.map((member) => (
              <CoreMemberCard key={member.login} member={member} />
            ))}
          </div>
        </section>

        <section
          aria-labelledby='community-heading'
          className='flex flex-col gap-5'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-col gap-1.5'>
              <h2 className='font-semibold text-lg' id='community-heading'>
                {t("contributors.community")}
              </h2>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {t("contributors.communityDescription")}
              </p>
            </div>
            <Button
              className='shrink-0 gap-2 text-muted-foreground'
              onClick={() => openUrl(`${GITHUB_REPO}/graphs/contributors`)}
              size='sm'
              variant='outline'>
              <GithubLogoIcon aria-hidden className='size-4' />
              {t("contributors.viewOnGithub")}
              <ArrowUpRightIcon aria-hidden className='size-3.5' />
            </Button>
          </div>
          <CommunityContributors />
        </section>

        <section className='flex flex-wrap items-center justify-between gap-5 border-border/60 border-t pt-8'>
          <div className='flex max-w-2xl items-start gap-4'>
            <HeartIcon
              aria-hidden
              className='mt-1 size-5 shrink-0 text-primary'
              weight='duotone'
            />
            <div className='flex flex-col gap-1.5'>
              <h2 className='font-semibold'>{t("contributors.thanksTitle")}</h2>
              <p className='text-muted-foreground text-sm leading-relaxed'>
                {t("contributors.thanksDescription")}
              </p>
            </div>
          </div>
          <Button
            className='shrink-0'
            onClick={() => openUrl(GITHUB_REPO)}
            size='sm'
            variant='outline'>
            <GithubLogoIcon aria-hidden className='size-4' />
            {t("contributors.contributeOnGithub")}
            <ArrowUpRightIcon aria-hidden className='size-3.5' />
          </Button>
        </section>
      </div>
    </div>
  );
};

export default Contributors;
