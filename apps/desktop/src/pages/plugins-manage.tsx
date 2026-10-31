import type { Icon } from "@phosphor-icons/react";
import {
  ArrowCircleUpIcon,
  CompassIcon,
  FileZipIcon,
  MagnifyingGlassIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  DetailPanel,
  EmptyDetailPanel,
  PANEL_TABS,
  type PanelTab,
} from "@/components/plugins/manage/detail-panel";
import { DiscoverTab } from "@/components/plugins/manage/discover-tab";
import { ExternalPluginRow } from "@/components/plugins/manage/external-plugin-row";
import {
  INSET_OUTLINE,
  RowButton,
  SectionHeader,
} from "@/components/plugins/manage/plugin-row";
import { useInstallFromFile } from "@/components/plugins/manage/use-install-plugin";
import { TONE_COLOR } from "@/components/plugins/plugin-status";
import { useExternalPlugins } from "@/hooks/use-external-plugins";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ExternalPluginSummary } from "@/types/generated/ExternalPluginSummary";

const TABS = ["installed", "discover", "updates"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS = {
  installed: SquaresFourIcon,
  discover: CompassIcon,
  updates: ArrowCircleUpIcon,
} satisfies Record<Tab, Icon>;

const parseTab = (value: string | null): Tab =>
  TABS.find((tab) => tab === value) ?? "installed";

const parsePanelTab = (value: string | null): PanelTab =>
  PANEL_TABS.find((tab) => tab === value) ?? "access";

const matches = (needle: string, ...texts: (string | null)[]) =>
  !needle || texts.some((text) => text?.toLowerCase().includes(needle));

type PageTabProps = {
  tab: Tab;
  active: boolean;
  count?: number;
  countTone?: "neutral" | "info";
  onSelect: () => void;
};

const PageTab = ({ tab, active, count, countTone, onSelect }: PageTabProps) => {
  const { t } = useTranslation();
  const TabIcon = TAB_ICONS[tab];
  const info = countTone === "info";
  return (
    <button
      aria-selected={active}
      className={cn(
        "flex items-center gap-[8px] rounded-[8px] px-[14px] py-[8px] transition-colors",
        INSET_OUTLINE,
        active
          ? "bg-[#1E1A18] outline-[#EFE0BE26]"
          : "outline-transparent hover:bg-[#1E1A18]",
      )}
      onClick={onSelect}
      role='tab'
      type='button'>
      <TabIcon color={active ? "#EFE0BE" : "#A3A3A3"} size={15} />
      <span
        className={cn(
          "font-semibold text-[13px] leading-[normal]",
          active ? "text-foreground" : "text-[#A3A3A3]",
        )}>
        {t(`plugins.manage.tabs.${tab}`)}
      </span>
      {count !== undefined && (
        <span
          className='rounded-[99px] px-[7px] py-[1px] font-mono font-semibold text-[11px] leading-[normal]'
          style={{
            backgroundColor: info ? "#60A5FA26" : "#FFFFFF0F",
            color: info ? TONE_COLOR.info : "#A3A3A3",
          }}>
          {count}
        </span>
      )}
    </button>
  );
};

const FindMore = ({ onBrowse }: { onBrowse: () => void }) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "flex w-full shrink-0 items-center gap-[14px] rounded-[12px] p-[16px] outline-[#FFFFFF1A]",
        INSET_OUTLINE,
      )}>
      <span className='flex size-[40px] shrink-0 items-center justify-center rounded-[10px] bg-[#FFFFFF0A]'>
        <CompassIcon color='#EFE0BE' size={20} />
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-[3px]'>
        <span className='font-semibold text-[14px] text-foreground leading-[normal]'>
          {t("plugins.manage.findMore.title")}
        </span>
        <span className='w-full text-[#A3A3A3] text-[12px] leading-[17px]'>
          {t("plugins.manage.findMore.body")}
        </span>
      </div>
      <RowButton icon={CompassIcon} onClick={onBrowse}>
        {t("plugins.manage.findMore.browse")}
      </RowButton>
    </div>
  );
};

const ListNote = ({ children }: { children: string }) => (
  <p className='w-full shrink-0 px-[2px] py-[10px] text-[#A3A3A3] text-[12px] leading-[normal]'>
    {children}
  </p>
);

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

const InstalledTab = ({
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

const UpdatesTab = ({
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
        <span className='flex size-[52px] items-center justify-center rounded-[12px] bg-[#FFFFFF0A]'>
          <ArrowCircleUpIcon color='#EFE0BE' size={26} />
        </span>
        <span className='pt-[8px] font-semibold text-[14px] text-foreground leading-[normal]'>
          {t("plugins.manage.updatesEmpty.title")}
        </span>
        <span className='max-w-[360px] text-[#A3A3A3] text-[12px] leading-[17px]'>
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
