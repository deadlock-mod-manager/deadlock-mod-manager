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

const getPage = (t: TFunction<"error-mod-order">): GuidePageData => ({
  path: "/deadlock-mod-manager-failed-to-save-mod-order",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

/** The cause that has its own guide. */
const OS_ERROR_5_CAUSE = "accessDenied";

export const Route = createFileRoute(
  "/deadlock-mod-manager-failed-to-save-mod-order",
)({
  component: FailedToSaveModOrderPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "error-mod-order");
    return guideHead(getPage(t), locale);
  },
});

function FailedToSaveModOrderPage() {
  const { t } = useTranslation("error-mod-order");
  const page = getPage(t);
  const causes = t("causes.items", { returnObjects: true });
  const nothingMatches = t("nothingMatches.steps", { returnObjects: true });

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

      <GuideSection title={t("causes.title")} intro={t("causes.intro")}>
        <ul className='grid gap-4 md:grid-cols-2'>
          {Object.entries(causes).map(([id, cause]) => (
            <li
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {t(`errorText.causes.${id as keyof typeof causes}`)}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                {cause.fix}
              </p>
              {id === OS_ERROR_5_CAUSE && (
                <Link
                  to='/deadlock-mod-manager-os-error-5'
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  {t("causes.os5Link")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title={t("nothingMatches.title")}>
        <div className={proseClassName}>
          <ol>
            {Object.keys(nothingMatches).map((id) => (
              <li key={id}>
                <Trans
                  t={t}
                  i18nKey={`nothingMatches.steps.${id as keyof typeof nothingMatches}`}
                  components={{
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
        current='/deadlock-mod-manager-failed-to-save-mod-order'
        guides={TROUBLESHOOTING_GUIDES}
      />
    </div>
  );
}
