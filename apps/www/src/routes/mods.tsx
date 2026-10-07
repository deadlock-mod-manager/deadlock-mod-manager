import { createFileRoute } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  GuideFaq,
  GuideFigure,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { PREVIEW_MODS } from "@/components/home/app-preview/mods";
import { ModCard } from "@/components/home/mod-card";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const GAMEBANANA_DEADLOCK_URL = "https://gamebanana.com/games/20948";

const getPage = (t: TFunction<"guide-mods">): GuidePageData => ({
  path: "/mods",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

const topMods = [...PREVIEW_MODS]
  .sort((a, b) => b.downloads - a.downloads)
  .slice(0, 8);

export const Route = createFileRoute("/mods")({
  component: ModsPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "guide-mods");
    return guideHead(getPage(t), locale);
  },
});

function ModsPage() {
  const { t } = useTranslation("guide-mods");
  const page = getPage(t);
  const categories = Object.entries(
    t("categories.items", { returnObjects: true }),
  );

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}
      />

      <GuideSection title={t("popular.title")} intro={t("popular.intro")}>
        <ul className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4'>
          {topMods.map((mod) => (
            <li key={mod.id}>
              <ModCard mod={mod} showDownloads />
            </li>
          ))}
        </ul>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          {t("popular.snapshot")}
        </p>
      </GuideSection>

      <GuideSection title={t("categories.title")}>
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {categories.map(([id, category]) => (
            <li
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-semibold'>{category.title}</h3>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                {category.body}
              </p>
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title={t("steps.title")}>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'>
          <StepList
            steps={Object.values(t("steps.items", { returnObjects: true }))}
          />
          <GuideFigure
            src='/home/app/store-1x.webp'
            width={1232}
            height={761}
            alt={t("steps.figure.alt")}
            caption={t("steps.figure.caption")}
          />
        </div>
      </GuideSection>

      <GuideSection title={t("gamebanana.title")}>
        <div className={proseClassName}>
          <p>
            <Trans
              t={t}
              i18nKey='gamebanana.manual'
              components={{
                link: (
                  <a
                    href={GAMEBANANA_DEADLOCK_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                ),
                code: <code />,
              }}
            />
          </p>
          <p>{t("gamebanana.app")}</p>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/mods' />
    </div>
  );
}
