import { cn } from "@deadlock-mods/ui/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { StepList } from "@/components/guides/guide-page";
import { CtaArrow, primaryCta, secondaryCta } from "@/components/home/cta";
import { Eyebrow } from "@/components/home/section-heading";
import { ConflictsDemo } from "@/components/v2/conflicts-demo";
import { FixTicker } from "@/components/v2/fix-ticker";
import { Seasons } from "@/components/v2/seasons";
import { UpdateDemo } from "@/components/v2/update-demo";
import { DISCORD_URL, V2_PREVIEW_URL } from "@/lib/constants";
import { headI18n, useNumberFormat } from "@/lib/i18n/route";
import { getV2Stats } from "@/lib/v2-stats";
import { seo } from "@/utils/seo";

export const Route = createFileRoute("/v2")({
  component: V2Page,
  loader: () => getV2Stats(),
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "v2");
    return seo({
      title: t("meta.title"),
      description: t("meta.description"),
      path: "/v2",
      type: "article",
      locale,
    });
  },
});

const sectionTitleClassName =
  "max-w-[20ch] text-balance font-bold font-primary text-[clamp(28px,3vw,40px)] leading-[1.1]";

const linkClassName =
  "[&_a]:text-foreground [&_a]:underline [&_a]:decoration-border-strong [&_a]:underline-offset-4 [&_a:hover]:decoration-primary";

const StoreScreenshot = () => {
  const { t } = useTranslation("v2");

  return (
    <img
      src='/home/app/store-1x.webp'
      srcSet='/home/app/store-1x.webp 1232w, /home/app/store-2x.webp 2464w'
      sizes='(min-width: 1024px) 50vw, 100vw'
      alt={t("features.store.alt")}
      width={1232}
      height={761}
      loading='lazy'
      className='w-full rounded-xl border border-border-strong bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.35)]'
    />
  );
};

const PerformanceScreenshot = () => {
  const { t } = useTranslation("v2");

  return (
    <img
      src='/home/app/performance.webp'
      alt={t("features.performance.alt")}
      width={1232}
      height={761}
      loading='lazy'
      className='w-full rounded-xl border border-border-strong bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.35)]'
    />
  );
};

type FeatureId = "updates" | "store" | "conflicts" | "performance";

const FEATURES: { id: FeatureId; visual: React.ReactNode }[] = [
  { id: "updates", visual: <UpdateDemo /> },
  { id: "store", visual: <StoreScreenshot /> },
  { id: "conflicts", visual: <ConflictsDemo /> },
  { id: "performance", visual: <PerformanceScreenshot /> },
];

const FeatureRow = ({
  id,
  visual,
  flip,
}: {
  id: FeatureId;
  visual: React.ReactNode;
  flip: boolean;
}) => {
  const { t } = useTranslation("v2");
  const points = Object.values(
    t(`features.${id}.points`, { returnObjects: true }),
  );

  return (
    <section
      id={id}
      className='mx-auto grid max-w-7xl scroll-mt-6 items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:gap-16'>
      <div className={cn(flip && "lg:order-2")}>
        <Eyebrow>{t(`features.${id}.nav`)}</Eyebrow>
        <h2 className={cn("mt-2", sectionTitleClassName)}>
          {t(`features.${id}.title`)}
        </h2>
        <p className='mt-4 max-w-[52ch] text-pretty text-muted-foreground leading-relaxed'>
          {t(`features.${id}.body`)}
        </p>
        <ul className='mt-6 space-y-2.5'>
          {points.map((point) => (
            <li
              key={point}
              className='flex gap-3 text-[15px] text-foreground-soft leading-relaxed'>
              <span
                aria-hidden='true'
                className='mt-[9px] size-1.5 shrink-0 rounded-[2px] bg-primary/80'
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <div>{visual}</div>
    </section>
  );
};

/**
 * Fix commits since the last V1 release that touch the desktop app or the
 * shared packages. Git history isn't in the image build, so refresh by hand:
 *   git log v1.1.0..origin/main --no-merges --format=%s -- apps/desktop packages \
 *     | grep -cE '^fix(\(|:|!)'
 */
const FIX_COMMITS_SINCE_V1 = 62;

/** Hero lines rise in one after another on first paint. */
const riseDelay = (index: number) => ({ animationDelay: `${index * 90}ms` });

function V2Page() {
  const { t } = useTranslation("v2");
  const { fixes } = Route.useLoaderData();
  const formatNumber = useNumberFormat();
  const moreItems = Object.entries(t("more.items", { returnObjects: true }));
  const steps = t("upgrade.steps", { returnObjects: true });
  const navItems = [
    ...FEATURES.map(({ id }) => ({ id, label: t(`features.${id}.nav`) })),
    { id: "themes", label: t("features.themes.nav") },
    { id: "more", label: t("nav.more") },
    { id: "upgrade", label: t("nav.upgrade") },
    { id: "fixes", label: t("nav.fixes") },
  ];
  const discordLink = (
    <a href={DISCORD_URL} target='_blank' rel='noopener noreferrer' />
  );

  return (
    <div className='overflow-x-clip'>
      <section className='relative isolate overflow-hidden'>
        <div aria-hidden='true' className='-z-10 absolute inset-0'>
          <div className='absolute inset-0 bg-[url(/backgrounds/bg-1.jpg)] bg-cover bg-[center_30%] opacity-25 [mask-image:radial-gradient(110%_90%_at_80%_20%,black_15%,transparent_70%)]' />
          <div className='absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,var(--color-background)_100%)]' />
        </div>
        <div className='mx-auto max-w-7xl px-6 pt-16 pb-12 lg:pt-24'>
          <p
            style={riseDelay(0)}
            className='inline-flex animate-dl-rise items-center gap-2.5 font-medium text-[13px] text-muted-foreground'>
            <span className='rounded-full bg-primary px-2 py-0.5 font-semibold text-primary-foreground text-xs'>
              V2
            </span>
            {t("hero.eyebrow")}
          </p>
          <h1
            style={riseDelay(1)}
            className='mt-4 max-w-[16ch] animate-dl-rise text-balance font-bold font-primary text-[clamp(44px,5.4vw,76px)] leading-[0.98] tracking-[-0.02em]'>
            {t("hero.title")}
          </h1>
          <p
            style={riseDelay(2)}
            className='mt-6 max-w-[58ch] animate-dl-rise text-pretty text-lg text-muted-foreground leading-relaxed'>
            {t("hero.intro")}
          </p>
          <div
            style={riseDelay(3)}
            className='mt-10 flex animate-dl-rise flex-wrap items-center gap-x-8 gap-y-3'>
            <a
              href={V2_PREVIEW_URL}
              target='_blank'
              rel='noopener noreferrer'
              className={primaryCta("lg")}>
              {t("hero.tryPreview")}
            </a>
            <Link to='/changelog' className={secondaryCta("lg")}>
              {t("hero.changelog")}
              <CtaArrow />
            </Link>
          </div>
          <nav
            aria-label={t("nav.label")}
            className='mt-14 flex flex-wrap gap-2 border-border border-t pt-6'>
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className='rounded-full border border-border px-3.5 py-1.5 text-muted-foreground text-sm hover:border-border-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {FEATURES.map((feature, index) => (
        <FeatureRow key={feature.id} {...feature} flip={index % 2 === 1} />
      ))}

      <section
        id='themes'
        className='mx-auto grid max-w-7xl scroll-mt-6 gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16'>
        <div>
          <Eyebrow>{t("features.themes.nav")}</Eyebrow>
          <h2 className={cn("mt-2", sectionTitleClassName)}>
            {t("features.themes.title")}
          </h2>
          <p className='mt-4 mb-8 max-w-[52ch] text-pretty text-muted-foreground leading-relaxed'>
            {t("features.themes.body")}
          </p>
          <figure>
            <img
              src='/home/app/theme-lovelock.webp'
              alt={t("features.themes.lovelockAlt")}
              width={1232}
              height={761}
              loading='lazy'
              className='w-full rounded-xl border border-border-strong shadow-[0_30px_80px_rgba(0,0,0,0.35)]'
            />
            <figcaption className='mt-3 text-[13px] text-muted-foreground'>
              Lovelock
            </figcaption>
          </figure>
        </div>
        <Seasons />
      </section>

      <section id='more' className='mx-auto max-w-7xl scroll-mt-6 px-6 py-16'>
        <h2 className={sectionTitleClassName}>{t("more.title")}</h2>
        <dl className='mt-8 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3'>
          {moreItems.map(([key, item]) => (
            <div key={key} className='border-border border-t py-5'>
              <dt className='font-semibold'>{item.title}</dt>
              <dd className='mt-1.5 text-muted-foreground text-sm leading-relaxed'>
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id='upgrade'
        className='mx-auto max-w-7xl scroll-mt-6 px-6 py-16'>
        <h2 className={sectionTitleClassName}>{t("upgrade.title")}</h2>
        <div className='mt-8 max-w-3xl'>
          <StepList
            steps={[
              steps.install,
              steps.migrate,
              {
                title: steps.help.title,
                body: (
                  <Trans
                    t={t}
                    i18nKey='upgrade.steps.help.body'
                    components={{ discord: discordLink }}
                  />
                ),
              },
            ]}
          />
        </div>
      </section>

      <section
        id='fixes'
        className='mx-auto grid max-w-7xl scroll-mt-6 items-center gap-10 px-6 py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16'>
        <div>
          <p
            aria-hidden='true'
            className='font-bold font-primary text-[clamp(96px,13vw,176px)] text-online tabular-nums leading-[0.85] tracking-[-0.03em]'>
            {formatNumber.format(FIX_COMMITS_SINCE_V1)}
          </p>
          <h2 className={cn("mt-4", sectionTitleClassName)}>
            <span className='sr-only'>
              {formatNumber.format(FIX_COMMITS_SINCE_V1)}{" "}
            </span>
            {t("fixes.label")}
          </h2>
          <p
            className={cn(
              "mt-4 max-w-[46ch] text-pretty text-muted-foreground leading-relaxed",
              linkClassName,
            )}>
            <Trans
              t={t}
              i18nKey='fixes.body'
              components={{ link: <Link to='/changelog' /> }}
            />
          </p>
        </div>
        <FixTicker fixes={fixes} />
      </section>

      <section id='thanks' className='mx-auto max-w-7xl px-6 pt-16 pb-28'>
        <h2 className='font-semibold text-primary'>{t("thanks.title")}</h2>
        <p
          className={cn(
            "mt-4 max-w-[24ch] text-balance font-bold font-primary text-[clamp(32px,4.4vw,60px)] leading-[1.05] tracking-[-0.01em]",
            linkClassName,
          )}>
          <Trans
            t={t}
            i18nKey='thanks.body'
            components={{ discord: discordLink }}
          />
        </p>
      </section>
    </div>
  );
}
