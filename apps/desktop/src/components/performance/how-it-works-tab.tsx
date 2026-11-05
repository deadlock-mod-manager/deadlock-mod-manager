import { Trans, useTranslation } from "react-i18next";
import type { EntryStatus } from "@/types/generated/EntryStatus";
import { ExternalLink } from "./details/details-header";
import { Basics } from "./how-it-works/basics";
import { StatusBadge, StatusGroup } from "./how-it-works/status-group";
import { Term } from "./how-it-works/term";
import { Topic } from "./how-it-works/topic";

const WRITTEN_STATUSES: EntryStatus[] = [
  "applies",
  "blocked",
  "removed",
  "notConvar",
];

const UNWRITTEN_STATUSES: EntryStatus[] = [
  "unchanged",
  "omitted",
  "engineSection",
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

/** What the feature does, where its facts come from and what each status means. */
export const HowItWorksTab = () => {
  const { t } = useTranslation();
  return (
    <div className='flex flex-col gap-6 py-4'>
      <Basics />

      <div className='divide-y overflow-hidden rounded-lg border bg-card'>
        <Topic
          summary={t("performance.howItWorks.writes.summary")}
          title={t("performance.howItWorks.writes.title")}>
          <p>{t("performance.howItWorks.writes.inPlace")}</p>
          <p>{t("performance.howItWorks.writes.turnOff")}</p>
          <p>{t("performance.howItWorks.writes.reapply")}</p>
          <p>{t("performance.howItWorks.writes.untouched")}</p>
          <p>{t("performance.howItWorks.writes.video")}</p>
        </Topic>

        <Topic
          summary={t("performance.howItWorks.statuses.summary")}
          title={t("performance.howItWorks.statuses.title")}>
          <p>{t("performance.howItWorks.statuses.description")}</p>
          <StatusGroup
            extra={
              <Term
                term={
                  <StatusBadge>
                    {t("performance.categories.camera")}
                  </StatusBadge>
                }>
                {t("performance.howItWorks.statuses.camera")}
              </Term>
            }
            statuses={WRITTEN_STATUSES}
            title={t("performance.howItWorks.statuses.written")}
          />
          <StatusGroup
            statuses={UNWRITTEN_STATUSES}
            title={t("performance.howItWorks.statuses.notWritten")}
          />
        </Topic>

        <Topic
          summary={t("performance.howItWorks.counts.summary")}
          title={t("performance.howItWorks.counts.title")}>
          <p>{t("performance.howItWorks.counts.settings")}</p>
          <p>{t("performance.howItWorks.counts.gamebanana")}</p>
        </Topic>

        <Topic
          summary={t("performance.howItWorks.scale.summary")}
          title={t("performance.howItWorks.scale.title")}>
          <p>{t("performance.howItWorks.scale.categories")}</p>
          <p>{t("performance.howItWorks.scale.position")}</p>
          <p>{t("performance.howItWorks.scale.tiers")}</p>
        </Topic>

        <Topic
          summary={t("performance.howItWorks.sources.summary")}
          title={t("performance.howItWorks.sources.title")}>
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
        </Topic>
      </div>
    </div>
  );
};
