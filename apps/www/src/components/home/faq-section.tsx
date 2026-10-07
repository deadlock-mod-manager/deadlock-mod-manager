import { ChevronDown } from "@deadlock-mods/ui/icons";
import type { TFunction } from "i18next";
import { Trans, useTranslation } from "react-i18next";
import { BUG_REPORT_URL, DISCORD_URL, DOCS_URL } from "@/lib/constants";
import type home from "@/locales/en/home.json";
import type { FaqEntry } from "@/utils/structured-data";
import { Eyebrow } from "./section-heading";

const linkClassName =
  "text-primary underline underline-offset-3 transition-colors hover:text-primary-hover";

type FaqId = keyof typeof home.faq.items;

// Display order. The copy lives in home.json (faq.items), which also feeds the
// FAQPage JSON-LD, so the page and the structured data never drift apart.
const FAQ_IDS = [
  "what",
  "install",
  "safe",
  "uninstall",
  "platforms",
  "bug",
  "docs",
  "officialSkins",
  "skinsVisible",
] as const satisfies readonly FaqId[];

const installSteps = (t: TFunction<"home">) =>
  Object.values(t("faq.items.install.steps", { returnObjects: true }));

/**
 * The home FAQ as plain question/answer pairs for JSON-LD. Answers keep their
 * <Trans> tags; structured-data strips them. The install steps become one
 * numbered paragraph.
 */
export const getHomeFaqs = (t: TFunction<"home">): FaqEntry[] =>
  FAQ_IDS.map((id) => ({
    question: t(`faq.items.${id}.question`),
    answer:
      id === "install"
        ? installSteps(t)
            .map((step, index) => `${index + 1}. ${step}`)
            .join(" ")
        : t(`faq.items.${id}.answer`),
  }));

// <Trans> fills in the link text.
const externalLink = (href: string) => (
  <a
    href={href}
    target='_blank'
    rel='noopener noreferrer'
    className={linkClassName}
  />
);

const FaqAnswer = ({ id }: { id: FaqId }) => {
  const { t } = useTranslation("home");

  if (id === "install") {
    return (
      <ol className='list-inside list-decimal space-y-1.5'>
        {Object.entries(
          t("faq.items.install.steps", { returnObjects: true }),
        ).map(([step, text]) => (
          <li key={step}>{text}</li>
        ))}
      </ol>
    );
  }

  return (
    <Trans
      t={t}
      i18nKey={`faq.items.${id}.answer`}
      components={{
        link: externalLink(BUG_REPORT_URL),
        docs: externalLink(DOCS_URL),
      }}
    />
  );
};

export const FAQSection = () => {
  const { t } = useTranslation("home");

  return (
    <section
      id='faq'
      className='mx-auto flex max-w-7xl scroll-mt-6 flex-wrap gap-12 px-6 pt-20 pb-25'>
      <div className='min-w-0 flex-[1_1_300px]'>
        <Eyebrow>{t("faq.eyebrow")}</Eyebrow>
        <h2 className='mt-2 font-bold font-primary text-[clamp(32px,3.6vw,46px)] leading-[1.08]'>
          {t("faq.title")}
        </h2>
        <p className='mt-3.5 max-w-[340px] text-[15px] text-muted-foreground leading-relaxed'>
          <Trans
            t={t}
            i18nKey='faq.intro'
            components={{
              docs: externalLink(`${DOCS_URL}/using-mod-manager/faq`),
              discord: externalLink(DISCORD_URL),
            }}
          />
        </p>
      </div>
      <div className='flex min-w-0 flex-[2_1_560px] flex-col gap-2.5'>
        {FAQ_IDS.map((id, index) => (
          <details
            key={id}
            open={index === 0}
            className='group rounded-[10px] border border-border bg-surface px-5'>
            <summary className='flex min-h-15 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden'>
              {t(`faq.items.${id}.question`)}
              <ChevronDown
                aria-hidden='true'
                className='size-[18px] shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180'
              />
            </summary>
            <div className='mb-[18px] max-w-[65ch] text-[15px] text-muted-foreground leading-[1.65]'>
              <FaqAnswer id={id} />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
};
