import { ArrowCircleUpIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { ExternalPluginRow } from "@/components/plugins/manage/external-plugin-row";
import { ListNote } from "@/components/plugins/manage/list-note";
import { matches } from "@/components/plugins/manage/manage-tabs";
import { SectionHeader } from "@/components/plugins/manage/section-header";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

export const UpdatesTab = ({
  plugins,
  needle,
  query,
  onSelect,
}: {
  plugins: ExternalPluginSummary[];
  needle: string;
  query: string;
  onSelect: (pluginId: string) => void;
}) => {
  const { t } = useTranslation();
  const visible = plugins.filter((plugin) =>
    matches(needle, plugin.name, plugin.description, plugin.author),
  );

  if (plugins.length === 0) {
    return (
      <div className='flex w-full flex-col items-center gap-[6px] py-[64px] text-center'>
        <span className='flex size-[52px] items-center justify-center rounded-[12px] bg-foreground/[0.04]'>
          <ArrowCircleUpIcon className='text-primary' size={26} />
        </span>
        <span className='pt-[8px] font-semibold text-[14px] text-foreground leading-[normal]'>
          {t("plugins.manage.updatesEmpty.title")}
        </span>
        <span className='max-w-[360px] text-muted-foreground text-[12px] leading-[17px]'>
          {t("plugins.manage.updatesEmpty.body")}
        </span>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-[10px]'>
      <SectionHeader
        count={visible.length}
        label={t("plugins.manage.sections.updates")}
      />
      {visible.length === 0 && (
        <ListNote>{t("plugins.manage.noMatches", { query })}</ListNote>
      )}
      {visible.map((plugin) => (
        <ExternalPluginRow
          key={plugin.id}
          onSelect={() => onSelect(plugin.id)}
          plugin={plugin}
          updateFirst
        />
      ))}
    </div>
  );
};
