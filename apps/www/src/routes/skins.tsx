import { createFileRoute } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  GuideDownloadBand,
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
import { DOCS_URL } from "@/lib/constants";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const getPage = (t: TFunction<"guide-skins">): GuidePageData => ({
  path: "/skins",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

const skins = PREVIEW_MODS.filter((mod) => mod.category === "Skins").sort(
  (a, b) => b.downloads - a.downloads,
);

export const Route = createFileRoute("/skins")({
  component: SkinsPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "guide-skins");
    return guideHead(getPage(t), locale);
  },
});

function SkinsPage() {
  const { t } = useTranslation("guide-skins");
  const page = getPage(t);

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}
      />

      <GuideSection title={t("popular.title")} intro={t("popular.intro")}>
        <ul className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4'>
          {skins.map((mod) => (
            <li key={mod.id}>
              <ModCard mod={mod} showDownloads />
            </li>
          ))}
        </ul>
        <p className='mt-4 text-[13px] text-muted-foreground'>
          {t("popular.snapshot")}
        </p>
      </GuideSection>

      <GuideSection title={t("steps.title")}>
        <StepList
          columns={2}
          steps={Object.values(t("steps.items", { returnObjects: true }))}
        />
      </GuideSection>

      <GuideSection title={t("foundry.title")}>
        <div className='grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]'>
          <div className={proseClassName}>
            <p>
              <Trans
                t={t}
                i18nKey='foundry.intro'
                components={{ strong: <strong /> }}
              />
            </p>
            <p>
              <Trans
                t={t}
                i18nKey='foundry.exports'
                components={{
                  link: (
                    <a
                      href={`${DOCS_URL}/using-mod-manager/customization`}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  ),
                }}
              />
            </p>
          </div>
          <GuideFigure
            src='/home/screens/mod-foundry.webp'
            width={1199}
            height={825}
            alt={t("foundry.figure.alt")}
            caption={t("foundry.figure.caption")}
          />
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/skins' />
      <GuideDownloadBand
        title={t("downloadBand.title")}
        body={t("downloadBand.body")}
      />
    </div>
  );
}
