import { createFileRoute, Link } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import {
  ErrorMessage,
  GuideFaq,
  GuideHero,
  GuideSection,
  proseClassName,
  RelatedGuides,
  StepList,
} from "@/components/guides/guide-page";
import { DISCORD_URL } from "@/lib/constants";
import { TROUBLESHOOTING_GUIDES } from "@/lib/guides";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const getPage = (t: TFunction<"error-os-740">): GuidePageData => ({
  path: "/deadlock-mod-manager-os-error-740",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

export const Route = createFileRoute("/deadlock-mod-manager-os-error-740")({
  component: OsError740Page,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "error-os-740");
    return guideHead(getPage(t), locale);
  },
});

function OsError740Page() {
  const { t } = useTranslation("error-os-740");
  const page = getPage(t);
  const steps = t("fix.steps", { returnObjects: true });
  const stillSeeing = t("stillSeeing.items", { returnObjects: true });

  return (
    <div className='overflow-x-clip'>
      <GuideHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        intro={t("hero.intro")}>
        <ErrorMessage source={t("hero.errorSource")}>
          {t("errorText.message")}
        </ErrorMessage>
      </GuideHero>

      <GuideSection title={t("fix.title")}>
        <StepList
          columns={2}
          steps={Object.entries(steps).map(([id, step]) => ({
            title: step.title,
            body: (
              <Trans
                t={t}
                i18nKey={`fix.steps.${id as keyof typeof steps}.body`}
                components={{ code: <code />, strong: <strong /> }}
              />
            ),
          }))}
        />
      </GuideSection>

      <GuideSection title={t("stillSeeing.title")}>
        <div className={proseClassName}>
          <ul>
            {Object.keys(stillSeeing).map((id) => (
              <li key={id}>
                <Trans
                  t={t}
                  i18nKey={`stillSeeing.items.${id as keyof typeof stillSeeing}`}
                  components={{
                    download: <Link to='/download' />,
                    os5: <Link to='/deadlock-mod-manager-os-error-5' />,
                    discord: (
                      <a
                        href={DISCORD_URL}
                        target='_blank'
                        rel='noopener noreferrer'
                      />
                    ),
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-mod-manager-os-error-740'
        guides={TROUBLESHOOTING_GUIDES}
      />
    </div>
  );
}
