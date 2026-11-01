import { FileZipIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  PANEL_TABS,
  type PanelTab,
} from "@/components/plugins/manage/detail-panel";
import { DiscoverTab } from "@/components/plugins/manage/discover-tab";
import { InstalledTab } from "@/components/plugins/manage/installed-tab";
import { TABS } from "@/components/plugins/manage/manage-tabs";
import type { Tab } from "@/components/plugins/manage/manage-tabs";
import { PageTab } from "@/components/plugins/manage/page-tab";
import { INSET_OUTLINE } from "@/components/plugins/manage/plugin-styles";
import { UpdatesTab } from "@/components/plugins/manage/updates-tab";
import { useInstallFromFile } from "@/components/plugins/manage/use-install-plugin";
import { useExternalPlugins } from "@/hooks/use-external-plugins";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const parseTab = (value: string | null): Tab =>
  TABS.find((tab) => tab === value) ?? "installed";

const parsePanelTab = (value: string | null): PanelTab =>
  PANEL_TABS.find((tab) => tab === value) ?? "access";

const ManagePlugins = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const pluginsQuery = useExternalPlugins();
  const installFromFile = useInstallFromFile();

  const tab = parseTab(params.get("tab"));
  const panelTab = parsePanelTab(params.get("panel"));
  const plugins = pluginsQuery.data ?? [];
  const updates = plugins.filter((plugin) => plugin.pendingUpdate);
  const selected =
    plugins.find((plugin) => plugin.id === params.get("plugin")) ?? plugins[0];
  const needle = query.trim().toLowerCase();

  const update = (changes: Record<string, string | null>) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const selectTab = (next: Tab) => {
    setQuery("");
    update({ tab: next });
  };

  const showInstalled = (pluginId: string) => {
    setQuery("");
    update({ tab: "installed", plugin: pluginId, panel: null });
  };

  return (
    <div className='flex h-full min-h-0 w-full flex-col gap-[16px] px-[24px] py-[18px]'>
      <div className='flex w-full shrink-0 items-center justify-between py-[2px]'>
        <div className='flex items-center gap-[4px]' role='tablist'>
          <PageTab
            active={tab === "installed"}
            count={plugins.length}
            onSelect={() => selectTab("installed")}
            tab='installed'
          />
          <PageTab
            active={tab === "discover"}
            onSelect={() => selectTab("discover")}
            tab='discover'
          />
          <PageTab
            active={tab === "updates"}
            count={updates.length > 0 ? updates.length : undefined}
            countTone='info'
            onSelect={() => selectTab("updates")}
            tab='updates'
          />
        </div>
        <div className='flex items-center gap-[10px]'>
          <label
            className={cn(
              "flex h-[34px] w-[240px] items-center gap-[8px] rounded-[8px] bg-background px-[10px] outline-[#262626] focus-within:outline-[#EFE0BE40]",
              INSET_OUTLINE,
            )}>
            <MagnifyingGlassIcon
              className='shrink-0'
              color='#A3A3A3'
              size={16}
            />
            <input
              aria-label={t(`plugins.manage.search.${tab}`)}
              className='min-w-0 flex-1 bg-transparent text-[13px] text-foreground leading-[normal] outline-none placeholder:text-[#A3A3A3]'
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t(`plugins.manage.search.${tab}`)}
              type='search'
              value={query}
            />
          </label>
          <button
            className={cn(
              "flex items-center gap-[8px] rounded-[8px] bg-background px-[14px] py-[8px] font-semibold text-[14px] text-foreground leading-[normal] outline-[#262626] transition-colors hover:bg-[#1E1A18] disabled:pointer-events-none disabled:opacity-50",
              INSET_OUTLINE,
            )}
            disabled={installFromFile.isPending}
            onClick={() => void installFromFile.pickAndInstall()}
            type='button'>
            <FileZipIcon color='currentColor' size={16} />
            {installFromFile.isPending
              ? t("plugins.manage.installing")
              : t("plugins.manage.installFromFile")}
          </button>
        </div>
      </div>

      {pluginsQuery.isError && (
        <p
          className='shrink-0 text-[#F87171] text-[12px] leading-[normal]'
          role='alert'>
          {t("plugins.manage.loadFailed", {
            message: getErrorMessage(pluginsQuery.error),
          })}
        </p>
      )}

      {tab === "installed" && (
        <InstalledTab
          needle={needle}
          onBrowse={() => selectTab("discover")}
          onPanelTabChange={(next) => update({ panel: next })}
          onSelect={(pluginId) => update({ plugin: pluginId })}
          panelTab={panelTab}
          plugins={plugins}
          query={query}
          selected={selected}
        />
      )}
      {tab === "discover" && (
        <div className='flex min-h-0 w-full flex-1 flex-col gap-[16px] overflow-y-auto [&>*]:shrink-0'>
          <DiscoverTab
            installedIds={new Set(plugins.map((plugin) => plugin.id))}
            query={query}
          />
        </div>
      )}
      {tab === "updates" && (
        <div className='flex min-h-0 w-full flex-1 flex-col overflow-y-auto [&>*]:shrink-0'>
          <UpdatesTab
            needle={needle}
            onSelect={showInstalled}
            plugins={updates}
            query={query}
          />
        </div>
      )}
    </div>
  );
};

export default ManagePlugins;
