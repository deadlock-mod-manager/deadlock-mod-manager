import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckIcon } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { AppPreview } from "@/components/home/app-preview";
import { PREVIEW_THEMES } from "@/components/home/app-preview/themes";
import { GITHUB_REPO } from "@/lib/constants";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const GRIMOIRE_SITE = "https://grimoiredeadlock.com/";

const getPage = (t: TFunction<"guide-grimoire">): GuidePageData => ({
  path: "/compare/grimoire",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

export const Route = createFileRoute("/compare/grimoire")({
  component: CompareGrimoirePage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "guide-grimoire");
    return guideHead(getPage(t), locale);
  },
});

function CompareGrimoirePage() {
  const { t } = useTranslation("guide-grimoire");
  const { t: tPreview } = useTranslation("preview");
  const page = getPage(t);
  /** What both apps do since Deadlock Mod Manager V2. */
  const shared = Object.entries(t("shared.features", { returnObjects: true }));
  /** Checked against both repositories' commit history in October 2026. */
  const rootsStats = Object.entries(t("roots.stats", { returnObjects: true }));
  const grimoireOptions = Object.entries(
    t("interface.grimoire.options", { returnObjects: true }),
  );
  const switchSteps = t("switch.steps", { returnObjects: true });
  /** The few differences that aren't about the interface. */
  const smallPrint = Object.entries(
    t("smallPrint.items", { returnObjects: true }),
  );

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}
      />

      <GuideSection title={t("shared.title")} intro={t("shared.intro")}>
        <ul className='grid gap-x-8 gap-y-3 rounded-2xl border border-border bg-surface p-6 sm:grid-cols-2 sm:p-8'>
          {shared.map(([id, feature]) => (
            <li key={id} className='flex items-start gap-3'>
              <CheckIcon
                aria-hidden='true'
                weight='bold'
                className='mt-1 size-4 shrink-0 text-primary'
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection id='roots' title={t("roots.title")}>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]'>
          <div className={proseClassName}>
            <p>
              <Trans
                t={t}
                i18nKey='roots.first'
                components={{ code: <code /> }}
              />
            </p>
            <p>{t("roots.grimoire")}</p>
          </div>
          <dl className='grid grid-cols-2 gap-4'>
            {rootsStats.map(([id, stat]) => (
              <div
                key={id}
                className='rounded-xl border border-border bg-surface p-5'>
                <dt className='text-muted-foreground text-sm'>{stat.label}</dt>
                <dd className='mt-1 font-bold font-primary text-2xl'>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </GuideSection>

      <GuideSection title={t("interface.title")} intro={t("interface.intro")}>
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'>
          <div className='rounded-2xl border border-border-strong bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              {t("interface.dmm.title")}
            </h3>
            <p className='mt-3 max-w-[56ch] text-muted-foreground leading-relaxed'>
              {t("interface.dmm.body")}
            </p>
            <ul className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3'>
              {PREVIEW_THEMES.map((theme) => (
                <li key={theme.id}>
                  <figure>
                    <img
                      src={theme.preview}
                      alt={t("interface.themeAlt", {
                        name: tPreview(`themes.${theme.id}.name`),
                      })}
                      width={1232}
                      height={761}
                      loading='lazy'
                      className='aspect-[1232/761] w-full rounded-lg border border-border object-cover'
                    />
                    <figcaption className='mt-1.5 text-[13px] text-muted-foreground'>
                      {tPreview(`themes.${theme.id}.name`)}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
          <div className='rounded-2xl border border-border bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              {t("interface.grimoire.title")}
            </h3>
            <p className='mt-3 text-muted-foreground leading-relaxed'>
              {t("interface.grimoire.body")}
            </p>
            <ul className='mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground text-sm leading-relaxed'>
              {grimoireOptions.map(([id, option]) => (
                <li key={id}>{option}</li>
              ))}
            </ul>
            <a
              href={GRIMOIRE_SITE}
              target='_blank'
              rel='noopener noreferrer'
              className='mt-6 inline-block font-medium text-foreground text-sm underline decoration-border-strong underline-offset-4 hover:decoration-primary'>
              {t("interface.grimoire.screenshots")}
            </a>
          </div>
        </div>
      </GuideSection>

      <GuideSection
        id='try-it'
        title={t("tryIt.title")}
        intro={t("tryIt.intro")}>
        <div className='hidden rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:block'>
          <AppPreview />
        </div>
        <ul className='grid gap-3 md:hidden'>
          {PREVIEW_THEMES.slice(0, 2).map((theme) => (
            <li key={theme.id}>
              <img
                src={theme.preview}
                alt={t("interface.themeAlt", {
                  name: tPreview(`themes.${theme.id}.name`),
                })}
                width={1232}
                height={761}
                loading='lazy'
                className='w-full rounded-xl border border-border'
              />
            </li>
          ))}
          <li className='text-foreground-subtle text-xs'>
            {t("tryIt.mobileNote")}
          </li>
        </ul>
      </GuideSection>

      <GuideSection
        id='switch'
        title={t("switch.title")}
        intro={t("switch.intro")}>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
          <StepList
            steps={[
              {
                title: switchSteps.install.title,
                body: (
                  <Trans
                    t={t}
                    i18nKey='switch.steps.install.body'
                    components={{ link: <Link to='/download' /> }}
                  />
                ),
              },
              switchSteps.import,
              switchSteps.pick,
              switchSteps.play,
            ]}
          />
          <div className='rounded-2xl border border-border-strong bg-surface p-6 sm:p-8'>
            <h3 className='font-bold font-primary text-2xl'>
              {t("switch.lockIn.title")}
            </h3>
            <div className={`${proseClassName} mt-3`}>
              <p>
                <Trans
                  t={t}
                  i18nKey='switch.lockIn.format'
                  components={{ strong: <strong /> }}
                />
              </p>
              <p>{t("switch.lockIn.reimport")}</p>
              <p>{t("switch.lockIn.tryBoth")}</p>
            </div>
          </div>
        </div>
      </GuideSection>

      <GuideSection title={t("smallPrint.title")}>
        <dl className='grid gap-4 md:grid-cols-3'>
          {smallPrint.map(([id, item]) => (
            <div
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <dt className='font-semibold'>{item.title}</dt>
              <dd className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                {item.body}
              </dd>
            </div>
          ))}
        </dl>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          <Trans
            t={t}
            i18nKey='smallPrint.sources'
            components={{
              link: (
                <a
                  href={`${GITHUB_REPO}/issues`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='underline underline-offset-4'
                />
              ),
            }}
          />
        </p>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/compare/grimoire' />
    </div>
  );
}
