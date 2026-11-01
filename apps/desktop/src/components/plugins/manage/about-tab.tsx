import { useTranslation } from "react-i18next";
import { AboutRow } from "@/components/plugins/manage/about-row";
import { SectionLabel } from "@/components/plugins/manage/section-label";
import { formatDateTime } from "@/components/plugins/plugin-format";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const AboutTab = ({ plugin }: { plugin: ExternalPluginSummary }) => {
  const { t, i18n } = useTranslation();
  return (
    <>
      <div className='flex w-full flex-col gap-[6px]'>
        <SectionLabel>{t("plugins.manage.about.description")}</SectionLabel>
        <p className='text-[12px] text-foreground leading-[17px]'>
          {plugin.description ?? t("plugins.manage.about.noDescription")}
        </p>
      </div>
      <div className='flex w-full flex-col gap-[6px]'>
        <SectionLabel>
          {t("plugins.manage.about.changelog", { version: plugin.version })}
        </SectionLabel>
        {plugin.changelog.length > 0 ? (
          <ul className='flex list-disc flex-col gap-[4px] pl-[16px] text-[12px] text-foreground leading-[17px]'>
            {plugin.changelog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className='text-[#A3A3A3] text-[12px] leading-[17px]'>
            {t("plugins.manage.about.noChangelog")}
          </p>
        )}
      </div>
      <div className='flex w-full flex-col'>
        <AboutRow label={t("plugins.manage.about.author")}>
          {plugin.author ?? t("plugins.manage.about.unknownAuthor")}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.version")} mono>
          {plugin.version}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.source")}>
          {plugin.source === "catalog"
            ? t("plugins.manage.panel.fromCatalog")
            : t("plugins.manage.panel.fromFile")}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.installedAt")}>
          {formatDateTime(i18n.language, plugin.installedAt)}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.updatedAt")}>
          {formatDateTime(i18n.language, plugin.updatedAt)}
        </AboutRow>
        <AboutRow label={t("plugins.manage.about.hash")} mono>
          {plugin.packageHash}
        </AboutRow>
      </div>
    </>
  );
};
