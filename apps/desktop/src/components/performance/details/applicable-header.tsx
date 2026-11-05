import {
  CalendarBlankIcon,
  CertificateIcon,
  GithubLogoIcon,
  GlobeIcon,
  TagIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type {
  ApplicableConfig,
  PresetListItem,
  UserListItem,
} from "@/lib/performance/config-list";
import { Chip } from "../configs/card-parts";
import { useOriginLabel } from "../configs/use-origin-label";
import { DetailsHeader, LinkChip } from "./details-header";

export const ApplicableHeader = ({
  item,
  config,
}: {
  item: PresetListItem | UserListItem;
  config: ApplicableConfig;
}) => {
  const { t, i18n } = useTranslation();
  const originLabel = useOriginLabel();
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  if (config.kind === "preset") {
    const { preset } = config;
    const versionLine = [
      preset.version,
      preset.updatedAt ? shortDate(preset.updatedAt) : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <DetailsHeader
        blurb={preset.blurb}
        chips={
          <>
            <Chip icon={<UserIcon aria-hidden />}>
              {t("performance.configs.by", { author: preset.author })}
            </Chip>
            {versionLine && (
              <Chip icon={<TagIcon aria-hidden />}>{versionLine}</Chip>
            )}
            {preset.source.kind === "github" && (
              <>
                <Chip icon={<CertificateIcon aria-hidden />}>
                  {preset.source.license}
                </Chip>
                <LinkChip
                  icon={<GithubLogoIcon aria-hidden />}
                  url={preset.source.url}>
                  {t("performance.configs.sources.github")}
                </LinkChip>
              </>
            )}
          </>
        }
        name={preset.name}
        tier={item.tier}
      />
    );
  }

  const { config: userConfig } = config;
  const { origin } = userConfig;
  return (
    <DetailsHeader
      blurb={null}
      chips={
        <>
          <Chip icon={<UserIcon aria-hidden />}>{originLabel(userConfig)}</Chip>
          <Chip icon={<CalendarBlankIcon aria-hidden />}>
            {t("performance.details.addedOn", {
              date: shortDate(userConfig.createdAt),
            })}
          </Chip>
          {userConfig.baseBuild !== null && (
            <Chip icon={<TagIcon aria-hidden />}>
              {t("performance.details.baseBuild", {
                build: userConfig.baseBuild,
              })}
            </Chip>
          )}
          {origin.kind === "gamebanana" && (
            <LinkChip
              icon={<GlobeIcon aria-hidden />}
              url={`https://gamebanana.com/mods/${origin.gamebananaId}`}>
              {t("performance.configs.sources.gamebanana")}
            </LinkChip>
          )}
        </>
      }
      name={userConfig.name}
      tier={item.tier}
    />
  );
};
