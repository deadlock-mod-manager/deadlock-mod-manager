import {
  ArrowRightIcon,
  CheckCircleIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { usePlatformDownload } from "@/components/downloads/platform-download-button";
import { orpc } from "@/utils/orpc";
import { CtaArrow, DownloadCta, secondaryCta } from "./cta";

/** The facts a player checks before running an installer that touches their game. */
const DownloadFacts = () => {
  const { t } = useTranslation("home");
  const { data } = useQuery(orpc.getVersion.queryOptions());
  // Phones and Macs already get "Available for Windows and Linux" under the button.
  const { canInstall } = usePlatformDownload();
  const version =
    data?.version && data.version !== "unknown" ? `v${data.version}` : null;
  const facts = [
    t("hero.facts.free"),
    version,
    ...(canInstall ? [t("hero.facts.platforms"), t("hero.facts.signed")] : []),
  ].filter(Boolean);

  return (
    <p className='mt-10 text-[13px] text-foreground-subtle'>
      {facts.join(" · ")}
    </p>
  );
};

export const HeroSection = () => {
  const { t } = useTranslation("home");

  return (
    <section
      id='top'
      className='relative isolate overflow-hidden lg:flex lg:min-h-[calc(100dvh-6.5rem)] lg:items-center'>
      <div aria-hidden='true' className='-z-10 absolute inset-0'>
        <div className='absolute inset-0 bg-[url(/backgrounds/bg-1.jpg)] bg-cover bg-[center_30%] opacity-40 [mask-image:radial-gradient(120%_95%_at_72%_35%,black_20%,transparent_78%)]' />
        <div className='absolute inset-0 bg-[radial-gradient(60%_55%_at_74%_48%,rgba(239,224,190,0.10),transparent_70%)]' />
        <div className='absolute inset-0 bg-[linear-gradient(90deg,var(--color-background)_8%,rgba(17,15,14,0.55)_45%,transparent_75%),linear-gradient(180deg,rgba(17,15,14,0.35)_0%,transparent_30%,transparent_70%,var(--color-background)_100%)]' />
      </div>

      <div className='mx-auto grid w-full max-w-7xl items-center gap-16 px-6 pt-16 pb-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-28 xl:gap-20'>
        <div className='relative z-10'>
          <Link
            to='/v2'
            className='group inline-flex items-center gap-2.5 rounded-full border border-border-strong bg-surface/80 py-1.5 pr-3.5 pl-2 text-[13px] text-foreground-soft backdrop-blur-sm transition-colors hover:border-border-hover hover:text-foreground'>
            <span className='rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs'>
              V2
            </span>
            {t("hero.v2Teaser")}
            <ArrowRightIcon
              aria-hidden='true'
              className='size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5'
            />
          </Link>

          <h1 className='mt-10 font-bold font-primary text-[clamp(46px,4.9vw,76px)] leading-[0.94] tracking-[-0.02em]'>
            <Trans
              t={t}
              i18nKey='hero.title'
              components={{
                br: <br />,
                accent: <span className='text-primary' />,
              }}
            />
          </h1>

          <p className='mt-8 max-w-[34ch] text-pretty text-[19px] text-muted-foreground leading-relaxed'>
            {t("hero.subtitle")}
          </p>

          <div
            id='download'
            className='mt-12 flex flex-wrap items-center gap-x-8 gap-y-3'>
            <DownloadCta />
            <Link to='/download' className={secondaryCta("lg")}>
              {t("hero.allDownloads")}
              <CtaArrow />
            </Link>
          </div>
          <DownloadFacts />
        </div>

        <HeroWindow />
      </div>
    </section>
  );
};

// A real mod from the store snapshot; mod names are never translated.
const TOAST_MOD_NAME = "Jacket (Billy Overhaul)";

/** The app window, angled and bleeding off the right edge on large screens. */
const HeroWindow = () => {
  const { t } = useTranslation("home");

  return (
    <div className='relative [perspective:2400px] lg:w-[calc(100%+max(0px,(100vw-80rem)/2)+1.5rem)]'>
      <div className='hero-window relative origin-left overflow-hidden rounded-2xl border border-white/10 bg-background shadow-[0_50px_120px_-24px_rgba(0,0,0,0.75),0_0_0_1px_rgba(239,224,190,0.05)] [--hero-tilt:rotateY(0deg)] lg:[--hero-tilt:rotateY(-13deg)_rotateX(3deg)]'>
        <img
          src='/home/app/store-1x.webp'
          srcSet='/home/app/store-1x.webp 1232w, /home/app/store-2x.webp 2464w'
          sizes='(min-width: 1024px) 60vw, 100vw'
          alt={t("hero.screenshotAlt")}
          width={1232}
          height={761}
          fetchPriority='high'
          className='block h-auto w-full'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
        />
      </div>

      {/* Plays one install once the window lands: progress fills, then it settles. */}
      <div
        aria-hidden='true'
        className='hero-toast -bottom-7 absolute left-6 hidden w-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#211d1b] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] sm:block lg:-left-8'>
        <div className='grid px-4 py-3.5'>
          <div className='hero-toast-installing col-start-1 row-start-1 flex gap-3'>
            <DownloadSimpleIcon
              weight='bold'
              className='mt-px size-5 shrink-0 text-primary'
            />
            <div>
              <div className='font-semibold text-sm'>
                {t("hero.toast.installing")}
              </div>
              <div className='mt-0.5 text-[13px] text-muted-foreground'>
                {TOAST_MOD_NAME}
              </div>
            </div>
          </div>
          <div className='hero-toast-done col-start-1 row-start-1 flex gap-3'>
            <CheckCircleIcon
              weight='fill'
              className='mt-px size-5 shrink-0 text-online'
            />
            <div>
              <div className='font-semibold text-sm'>
                {t("hero.toast.installed")}
              </div>
              <div className='mt-0.5 text-[13px] text-muted-foreground'>
                {t("hero.toast.ready", { name: TOAST_MOD_NAME })}
              </div>
            </div>
          </div>
        </div>
        <div className='h-0.5 bg-white/5'>
          <div className='hero-toast-progress h-full origin-left bg-primary' />
        </div>
      </div>
    </div>
  );
};
