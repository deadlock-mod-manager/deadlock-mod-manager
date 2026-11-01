import { useTranslation } from "react-i18next";
import {
  DetailPanel,
  type PanelTab,
} from "@/components/plugins/manage/detail-panel";
import { EmptyDetailPanel } from "@/components/plugins/manage/empty-detail-panel";
import { ExternalPluginRow } from "@/components/plugins/manage/external-plugin-row";
import { FindMore } from "@/components/plugins/manage/find-more";
import { ListNote } from "@/components/plugins/manage/list-note";
import { matches } from "@/components/plugins/manage/manage-tabs";
import { SectionHeader } from "@/components/plugins/manage/section-header";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

type InstalledTabProps = {
  plugins: ExternalPluginSummary[];
  needle: string;
  query: string;
  selected: ExternalPluginSummary | undefined;
  panelTab: PanelTab;
  onSelect: (pluginId: string) => void;
  onPanelTabChange: (tab: PanelTab) => void;
  onBrowse: () => void;
};

export const InstalledTab = ({
  plugins,
  needle,
  query,
  selected,
  panelTab,
  onSelect,
  onPanelTabChange,
  onBrowse,
}: InstalledTabProps) => {
  const { t } = useTranslation();
  const visiblePlugins = plugins.filter((plugin) =>
    matches(needle, plugin.name, plugin.description, plugin.author),
  );

  return (
    <div className='flex min-h-0 w-full flex-1 gap-[16px]'>
      <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-[10px] overflow-y-auto [&>*]:shrink-0'>
        <SectionHeader
          count={visiblePlugins.length}
          label={t("plugins.manage.sections.installedByYou")}
        />
        {visiblePlugins.length === 0 && (
          <ListNote>
            {needle
              ? t("plugins.manage.noMatches", { query })
              : t("plugins.manage.noInstalled")}
          </ListNote>
        )}
        {visiblePlugins.map((plugin) => (
          <ExternalPluginRow
            key={plugin.id}
            onSelect={() => onSelect(plugin.id)}
            plugin={plugin}
            selected={plugin.id === selected?.id}
          />
        ))}
        <FindMore onBrowse={onBrowse} />
      </div>
      {selected ? (
        <DetailPanel
          key={selected.id}
          onTabChange={onPanelTabChange}
          plugin={selected}
          tab={panelTab}
        />
      ) : (
        <EmptyDetailPanel onBrowse={onBrowse} />
      )}
    </div>
  );
};
