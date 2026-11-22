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
} from "@/components/guides/guide-page";
import { DISCORD_URL } from "@/lib/constants";
import { TROUBLESHOOTING_GUIDES } from "@/lib/guides";
import { headI18n } from "@/lib/i18n/route";
import { guideHead, type GuidePageData } from "@/utils/structured-data";

const getPage = (t: TFunction<"error-download">): GuidePageData => ({
  path: "/deadlock-mod-manager-failed-to-download",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

/** The message that has its own guide. */
const OS_ERROR_5_MESSAGE = "writeFailed";

export const Route = createFileRoute(
  "/deadlock-mod-manager-failed-to-download",
)({
  component: FailedToDownloadPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "error-download");
    return guideHead(getPage(t), locale);
  },
});

function FailedToDownloadPage() {
  const { t } = useTranslation("error-download");
  const page = getPage(t);
  const results = t("diagnose.results", { returnObjects: true });
  const messages = t("messages.items", { returnObjects: true });
  const stuck = t("stuck.steps", { returnObjects: true });

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

      <GuideSection title={t("diagnose.title")} intro={t("diagnose.intro")}>
        <div className={proseClassName}>
          <ul>
            {Object.keys(results).map((id) => (
              <li key={id}>
                <Trans
                  t={t}
                  i18nKey={`diagnose.results.${id as keyof typeof results}`}
                  components={{ strong: <strong /> }}
                />
              </li>
            ))}
          </ul>
        </div>
      </GuideSection>

      <GuideSection title={t("messages.title")}>
        <ul className='grid gap-4 md:grid-cols-2'>
          {Object.entries(messages).map(([id, item]) => (
            <li
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {t(`errorText.messages.${id as keyof typeof messages}`)}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                {item.fix}
              </p>
              {id === OS_ERROR_5_MESSAGE && (
                <Link
                  to='/deadlock-mod-manager-os-error-5'
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  {t("messages.os5Link")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title={t("stuck.title")}>
        <div className={proseClassName}>
          <ol>
            {Object.keys(stuck).map((id) => (
              <li key={id}>
                <Trans
                  t={t}
                  i18nKey={`stuck.steps.${id as keyof typeof stuck}`}
                  components={{
                    status: <Link to='/status' />,
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
          </ol>
        </div>
      </GuideSection>

      <GuideFaq faqs={page.faqs} />
      <RelatedGuides
        current='/deadlock-mod-manager-failed-to-download'
        guides={TROUBLESHOOTING_GUIDES}
      />
    </div>
  );
}
