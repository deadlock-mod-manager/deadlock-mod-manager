import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { EntryStatus } from "@/types/generated/EntryStatus";
import { ExternalLink } from "./details/details-header";

const STATUSES: EntryStatus[] = [
  "applies",
  "unchanged",
  "blocked",
  "removed",
  "notConvar",
  "engineSection",
  "omitted",
  "excluded",
  "denied",
  "unsupported",
];

const SOURCES = ["convars", "history", "stock", "presets", "gamebanana"];

const SOURCE_LINKS = {
  schemaExplorer: (
    <ExternalLink url='https://github.com/ValveResourceFormat/SchemaExplorer' />
  ),
  gameTracking: (
    <ExternalLink url='https://github.com/SteamTracking/GameTracking-Deadlock' />
  ),
  optimizationLock: (
    <ExternalLink url='https://github.com/Sqooky/OptimizationLock' />
  ),
  optiLock: <ExternalLink url='https://github.com/dacooderr/OptiLock' />,
  gamebanana: <ExternalLink url='https://gamebanana.com/games/20948' />,
};

const Section = ({
  title,
  wide = false,
  children,
}: {
  title: string;
  /** Spans both columns on wide screens. */
  wide?: boolean;
  children: ReactNode;
}) => (
  <section
    className={cn(
      "flex flex-col gap-3 rounded-lg border bg-card p-5",
      wide && "xl:col-span-2",
    )}>
    <h3 className='font-medium text-sm'>{title}</h3>
    <div className='flex flex-col gap-2 text-muted-foreground text-sm leading-relaxed'>
      {children}
    </div>
  </section>
);

const Term = ({ term, children }: { term: string; children: ReactNode }) => (
  <div className='grid grid-cols-[11rem_minmax(0,1fr)] gap-4 border-b py-2 last:border-b-0'>
    <dt className='font-medium text-foreground'>{term}</dt>
    <dd>{children}</dd>
  </div>
);

/** What the feature does, where its facts come from and what each status means. */
export const HowItWorksTab = () => {
  const { t } = useTranslation();
  return (
    <div className='grid gap-4 py-4 xl:grid-cols-2'>
      <Section title={t("performance.howItWorks.writes.title")} wide>
        <p>{t("performance.howItWorks.writes.inPlace")}</p>
        <p>{t("performance.howItWorks.writes.turnOff")}</p>
        <p>{t("performance.howItWorks.writes.reapply")}</p>
        <p>{t("performance.howItWorks.writes.untouched")}</p>
      </Section>

      <Section title={t("performance.howItWorks.sources.title")} wide>
        <dl>
          {SOURCES.map((source) => (
            <Term
              key={source}
              term={t(`performance.howItWorks.sources.${source}.term`)}>
              <Trans
                components={SOURCE_LINKS}
                i18nKey={`performance.howItWorks.sources.${source}.body`}
              />
            </Term>
          ))}
        </dl>
        <p>{t("performance.howItWorks.sources.updates")}</p>
      </Section>

      <Section title={t("performance.howItWorks.statuses.title")} wide>
        <p>{t("performance.howItWorks.statuses.description")}</p>
        <dl>
          {STATUSES.map((status) => (
            <Term key={status} term={t(`performance.status.${status}`)}>
              {t(`performance.howItWorks.statuses.${status}`)}
            </Term>
          ))}
          <Term term={t("performance.categories.camera")}>
            {t("performance.howItWorks.statuses.camera")}
          </Term>
        </dl>
      </Section>

      <Section title={t("performance.howItWorks.counts.title")}>
        <p>{t("performance.howItWorks.counts.settings")}</p>
        <p>{t("performance.howItWorks.counts.unused")}</p>
        <p>{t("performance.howItWorks.counts.gamebanana")}</p>
      </Section>

      <Section title={t("performance.howItWorks.scale.title")}>
        <p>{t("performance.howItWorks.scale.categories")}</p>
        <p>{t("performance.howItWorks.scale.position")}</p>
        <p>{t("performance.howItWorks.scale.tiers")}</p>
      </Section>
    </div>
  );
};
