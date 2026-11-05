import { Trans, useTranslation } from "react-i18next";
import type { ApplicableConfig } from "@/lib/performance/config-list";
import { ExternalLink } from "./details-header";
import { DetailsSection } from "./details-parts";

export const Credits = ({ config }: { config: ApplicableConfig }) => {
  const { t } = useTranslation();
  if (config.kind !== "preset") return null;
  const { preset } = config;
  return (
    <DetailsSection title={t("performance.details.credits.title")}>
      <p className='text-muted-foreground text-xs'>
        {preset.source.kind === "github" ? (
          <Trans
            components={{
              repo: (
                <ExternalLink
                  url={`https://github.com/${preset.source.repo}`}
                />
              ),
              commit: <ExternalLink url={preset.source.url} />,
            }}
            i18nKey='performance.details.credits.github'
            values={{
              author: preset.author,
              repo: preset.source.repo,
              license: preset.source.license,
              commit: preset.source.commit.slice(0, 7),
            }}
          />
        ) : (
          t("performance.details.credits.bundled", { author: preset.author })
        )}
      </p>
    </DetailsSection>
  );
};
