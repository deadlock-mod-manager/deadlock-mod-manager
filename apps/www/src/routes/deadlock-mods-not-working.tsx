import { createFileRoute, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
} from "@/components/guides/guide-page";
import { DISCORD_URL, DOCS_URL } from "@/lib/constants";
import { ERROR_GUIDES } from "@/lib/guides";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const getPage = (t: TFunction<"guide-not-working">): GuidePageData => ({
  path: "/deadlock-mods-not-working",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

export const Route = createFileRoute("/deadlock-mods-not-working")({
  component: ModsNotWorkingPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "guide-not-working");
    return guideHead(getPage(t), locale);
  },
});

function ModsNotWorkingPage() {
  const { t } = useTranslation("guide-not-working");
  const { t: tc } = useTranslation("common");
  const page = getPage(t);
  const fixes = Object.entries(t("fixes.items", { returnObjects: true }));

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}
      />

      <GuideSection title={t("quickFix.title")}>
        <div className={proseClassName}>
          <ol>
            <li>
              <Trans
                t={t}
                i18nKey='quickFix.steps.updateApp'
                components={{ link: <Link to='/download' /> }}
              />
            </li>
            <li>{t("quickFix.steps.updateMods")}</li>
            <li>
              <Trans
                t={t}
                i18nKey='quickFix.steps.disableHud'
                components={{ strong: <strong /> }}
              />
            </li>
            <li>{t("quickFix.steps.reenable")}</li>
          </ol>
        </div>
      </GuideSection>

      <GuideSection title={t("fixes.title")}>
        <ul className='grid gap-4 md:grid-cols-2'>
          {fixes.map(([id, item]) => (
            <li
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-semibold text-base'>{item.title}</h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>
                  {t("fixes.why")}{" "}
                </span>
                {item.cause}
              </p>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>
                  {t("fixes.fix")}{" "}
                </span>
                {item.fix}
              </p>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection
        id='error-messages'
        title={t("errors.title")}
        intro={t("errors.intro")}>
        <ul className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {ERROR_GUIDES.map((guide) => (
            <li key={guide.path}>
              <Link
                to={guide.path}
                className='flex h-full flex-col rounded-xl border border-border bg-surface p-5 hover:border-border-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
                <span className='font-mono font-semibold text-[15px]'>
                  {tc(`guides.${guide.key}.label`)}
                </span>
                <span className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                  {tc(`guides.${guide.key}.description`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title={t("stillStuck.title")}>
        <div className={proseClassName}>
          <p>
            <Trans
              t={t}
              i18nKey='stillStuck.body'
              components={{
                docs: (
                  <a
                    href={`${DOCS_URL}/using-mod-manager/troubleshooting`}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                ),
                discord: (
                  <a
                    href={DISCORD_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                ),
              }}
            />
          </p>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/deadlock-mods-not-working' />
    </div>
  );
}
