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

const getPage = (t: TFunction<"error-fatal">): GuidePageData => ({
  path: "/deadlock-fatal-error-unable-to-load-layout-file",
  name: t("meta.name"),
  title: t("meta.title"),
  description: t("meta.description"),
  faqs: Object.values(t("faqs", { returnObjects: true })),
});

/** The error the KeyValues parser helps fix. */
const KV_PARSER_ERROR = "kv3";

export const Route = createFileRoute(
  "/deadlock-fatal-error-unable-to-load-layout-file",
)({
  component: FatalErrorPage,
  head: ({ match }) => {
    const { t, locale } = headI18n(match, "error-fatal");
    return guideHead(getPage(t), locale);
  },
});

function FatalErrorPage() {
  const { t } = useTranslation("error-fatal");
  const page = getPage(t);
  const steps = t("fix.steps", { returnObjects: true });
  const errors = t("errors.items", { returnObjects: true });

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
        <StepList columns={2} steps={Object.values(steps)} />
      </GuideSection>

      <GuideSection title={t("errors.title")} intro={t("errors.intro")}>
        <ul className='grid gap-4 md:grid-cols-2'>
          {Object.entries(errors).map(([id, item]) => (
            <li
              key={id}
              className='rounded-xl border border-border bg-surface p-5'>
              <h3 className='font-mono font-semibold text-[15px] leading-snug'>
                {t(`errorText.errors.${id as keyof typeof errors}`)}
              </h3>
              <p className='mt-3 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>
                  {t("errors.whyLabel")}{" "}
                </span>
                {item.cause}
              </p>
              <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                <span className='font-medium text-foreground'>
                  {t("errors.fixLabel")}{" "}
                </span>
                {item.fix}
              </p>
              {id === KV_PARSER_ERROR && (
                <Link
                  to='/kv-parser'
                  className='mt-3 inline-block text-foreground text-sm underline underline-offset-4'>
                  {t("errors.kvParserLink")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </GuideSection>

      <GuideSection title={t("withoutMods.title")}>
        <div className={proseClassName}>
          <p>
            <Trans
              t={t}
              i18nKey='withoutMods.verify'
              components={{ strong: <strong /> }}
            />
          </p>
          <p>
            <Trans
              t={t}
              i18nKey='withoutMods.notWorking'
              components={{
                guide: <Link to='/deadlock-mods-not-working' />,
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
      <RelatedGuides
        current='/deadlock-fatal-error-unable-to-load-layout-file'
        guides={TROUBLESHOOTING_GUIDES}
      />
    </div>
  );
}
