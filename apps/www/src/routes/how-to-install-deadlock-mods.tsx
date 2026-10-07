import { createFileRoute, Link } from "@tanstack/react-router";
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
import { DOCS_URL } from "@/lib/constants";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const getPage = (t: TFunction<"guide-install">): GuidePageData => ({
  path: "/how-to-install-deadlock-mods",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

export const Route = createFileRoute("/how-to-install-deadlock-mods")({
  component: InstallGuidePage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "guide-install");
    return guideHead(getPage(t), locale);
  },
});

function InstallGuidePage() {
  const { t } = useTranslation("guide-install");
  const page = getPage(t);
  const appSteps = t("app.steps", { returnObjects: true });
  const code = { code: <code /> };

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}
      />

      <GuideSection
        id='with-the-app'
        title={t("app.title")}
        intro={t("app.intro")}>
        <div className='grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
          <StepList
            steps={[
              {
                title: appSteps.download.title,
                body: (
                  <Trans
                    t={t}
                    i18nKey='app.steps.download.body'
                    components={{ link: <Link to='/download' /> }}
                  />
                ),
              },
              appSteps.detect,
              appSteps.pick,
              appSteps.launch,
            ]}
          />
          <GuideFigure
            src='/home/app/slide-launch.webp'
            width={880}
            height={704}
            alt={t("app.figure.alt")}
            caption={t("app.figure.caption")}
          />
        </div>
      </GuideSection>

      <GuideSection
        id='manually'
        title={t("manual.title")}
        intro={t("manual.intro")}>
        <div className={proseClassName}>
          <ol>
            <li>
              <Trans t={t} i18nKey='manual.steps.extract' components={code} />
            </li>
            <li>
              <Trans t={t} i18nKey='manual.steps.addons' components={code} />
            </li>
            <li>
              <Trans t={t} i18nKey='manual.steps.copy' components={code} />
            </li>
            <li>
              <Trans t={t} i18nKey='manual.steps.gameinfo' components={code} />
              <pre className='mt-3 overflow-x-auto rounded-lg border border-border bg-surface p-4 text-[13px] text-foreground'>
                {"Game    citadel/addons\nMod     citadel"}
              </pre>
            </li>
            <li>
              <Trans t={t} i18nKey='manual.steps.launch' components={code} />
            </li>
          </ol>
          <p>{t("manual.outro")}</p>
        </div>
      </GuideSection>

      <GuideSection title={t("after.title")}>
        <div className={proseClassName}>
          <ul>
            <li>
              <Trans
                t={t}
                i18nKey='after.conflicts'
                components={{ strong: <strong /> }}
              />
            </li>
            <li>
              <Trans
                t={t}
                i18nKey='after.updates'
                components={{ strong: <strong /> }}
              />
            </li>
            <li>
              <Trans
                t={t}
                i18nKey='after.profiles'
                components={{ strong: <strong /> }}
              />
            </li>
            <li>
              <Trans
                t={t}
                i18nKey='after.docs'
                components={{
                  link: (
                    <a
                      href={`${DOCS_URL}/using-mod-manager/getting-started`}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
                  ),
                }}
              />
            </li>
          </ul>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides current='/how-to-install-deadlock-mods' />
      <GuideDownloadBand
        title={t("downloadBand.title")}
        body={t("downloadBand.body")}
      />
    </div>
  );
}
