import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  LayoutGrid,
  Pencil,
  TriangleAlert,
  Users,
} from "@deadlock-mods/ui/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import PageTitle from "@/components/shared/page-title";
import { AccountPrompt } from "@/components/stats/account-prompt";
import { DashboardDataProvider } from "@/components/stats/dashboard/dashboard-context";
import {
  DashboardGrid,
  type GridActions,
} from "@/components/stats/dashboard/dashboard-grid";
import { DashboardTabs } from "@/components/stats/dashboard/dashboard-tabs";
import {
  ConfirmDialog,
  EditToolbar,
} from "@/components/stats/dashboard/dashboard-toolbar";
import type { WidgetHealth } from "@/components/stats/dashboard/dashboard-widget";
import { useTabTitle } from "@/components/stats/dashboard/use-tab-title";
import { WidgetEditor } from "@/components/stats/dashboard/widget-editor";
import {
  widgetNeedsAccount,
  widgetNeedsHistory,
} from "@/components/stats/dashboard/widget-requirements";
import { StatsHeader } from "@/components/stats/stats-header";
import { StatsHints } from "@/components/stats/stats-hints";
import { StatsStatus } from "@/components/stats/stats-status";
import { StatTileSkeleton } from "@/components/stats/stat-tile";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import {
  useHeroCatalog,
  usePlayerStats,
  useRankAssets,
  useStatsRefresh,
} from "@/hooks/use-player-stats";
import { useSelectedSteamAccount } from "@/hooks/use-steam-accounts";
import {
  addTab,
  cloneLayout,
  type DashboardLayout,
  type DashboardTab,
  type DashboardWidget,
  DEFAULT_LAYOUT,
  duplicateWidget,
  moveTab,
  moveWidgetToTab,
  parseLayout,
  removeTab,
  removeWidget,
  reorderWidget,
  resizeWidget,
  updateTab,
  upsertWidget,
} from "@/lib/stats/dashboard/layout";
import { emptyTab, tabFromTemplate } from "@/lib/stats/dashboard/templates";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const StatsSkeleton = () => (
  <div className='flex flex-col gap-4'>
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'>
      {Array.from({ length: 5 }, (_, index) => (
        <StatTileSkeleton key={index} />
      ))}
    </div>
    <Skeleton className='h-[320px] w-full rounded-xl' />
    <div className='grid gap-4 lg:grid-cols-2'>
      <Skeleton className='h-[280px] w-full rounded-xl' />
      <Skeleton className='h-[280px] w-full rounded-xl' />
    </div>
  </div>
);

type EditorTarget = { tabId: string; widget: DashboardWidget | null };
type PendingConfirm =
  | { kind: "reset" }
  | { kind: "discard" }
  | { kind: "deleteTab"; tab: DashboardTab };

const Stats = () => {
  const { t } = useTranslation();
  const tabTitle = useTabTitle();
  const { analytics } = useAnalyticsContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const storedLayout = usePersistedStore((state) => state.statsDashboard);
  const setStoredLayout = usePersistedStore((state) => state.setStatsDashboard);
  const { layout: savedLayout, recovered } = useMemo(
    () => parseLayout(storedLayout),
    [storedLayout],
  );
  // While editing, changes land in a draft; the saved layout only moves on save.
  const [draft, setDraft] = useState<DashboardLayout | null>(null);
  const editing = draft !== null;
  const layout = draft ?? savedLayout;

  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [health, setHealth] = useState<Record<string, WidgetHealth>>({});

  const tabParam = searchParams.get("tab");
  const activeTab =
    layout.tabs.find((tab) => tab.id === tabParam) ?? layout.tabs[0];

  const {
    accounts,
    account,
    accountId,
    isPending: accountsPending,
    setAccountId,
  } = useSelectedSteamAccount();
  const hasAccount = accountId !== null;
  const stats = usePlayerStats(accountId);
  const { heroesById } = useHeroCatalog();
  const rankAssets = useRankAssets();
  const { refresh, isRefreshing, canRefresh } = useStatsRefresh();

  useEffect(() => {
    analytics.trackPageViewed(`stats-${activeTab.id}`, { tab: activeTab.id });
  }, [analytics, activeTab.id]);

  const selectTab = useCallback(
    (tabId: string) => setSearchParams({ tab: tabId }, { replace: true }),
    [setSearchParams],
  );

  const handleHealth = useCallback(
    (widgetId: string, next: WidgetHealth) =>
      setHealth((current) =>
        current[widgetId] === next ? current : { ...current, [widgetId]: next },
      ),
    [],
  );

  const brokenTabIds = useMemo(
    () =>
      new Set(
        layout.tabs
          .filter((tab) =>
            tab.widgets.some((widget) => health[widget.id] === "broken"),
          )
          .map((tab) => tab.id),
      ),
    [layout.tabs, health],
  );

  const editDraft = useCallback(
    (change: (current: DashboardLayout) => DashboardLayout) =>
      setDraft((current) => (current ? change(current) : current)),
    [],
  );

  const gridActions = useMemo(
    (): GridActions => ({
      onEdit: (widget) => setEditorTarget({ tabId: activeTab.id, widget }),
      onRemove: (widgetId) =>
        editDraft((current) => removeWidget(current, activeTab.id, widgetId)),
      onDuplicate: (widgetId) =>
        editDraft((current) =>
          duplicateWidget(current, activeTab.id, widgetId),
        ),
      onResize: (widgetId, size) =>
        editDraft((current) =>
          resizeWidget(current, activeTab.id, widgetId, size),
        ),
      onReorder: (widgetId, targetId) =>
        editDraft((current) =>
          reorderWidget(current, activeTab.id, widgetId, targetId),
        ),
      onMoveToTab: (widgetId, tabId) =>
        editDraft((current) =>
          moveWidgetToTab(current, activeTab.id, widgetId, tabId),
        ),
    }),
    [activeTab.id, editDraft],
  );

  const startEditing = () => setDraft(cloneLayout(savedLayout));
  const isDirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(savedLayout);

  const save = () => {
    if (!draft) {
      return;
    }
    // Saving the untouched default stores nothing, so later releases can still
    // improve the default for everyone who never customised it.
    setStoredLayout(
      JSON.stringify(draft) === JSON.stringify(DEFAULT_LAYOUT) ? null : draft,
    );
    setDraft(null);
  };

  const cancel = () => {
    if (isDirty) {
      setPendingConfirm({ kind: "discard" });
      return;
    }
    setDraft(null);
  };

  const addTabFrom = (templateId: string | null) => {
    if (!draft) {
      return;
    }
    const title = templateId
      ? t(`stats.dashboard.templates.${templateId}`)
      : t("stats.dashboard.tabs.untitled");
    const tab = templateId
      ? tabFromTemplate(templateId, draft, title)
      : emptyTab(title);
    if (tab) {
      setDraft(addTab(draft, tab));
      selectTab(tab.id);
    }
  };

  const confirmPending = () => {
    if (!pendingConfirm) {
      return;
    }
    switch (pendingConfirm.kind) {
      case "reset":
        setDraft(cloneLayout(DEFAULT_LAYOUT));
        break;
      case "discard":
        setDraft(null);
        break;
      case "deleteTab": {
        const remaining = draft
          ? removeTab(draft, pendingConfirm.tab.id)
          : null;
        setDraft(remaining);
        if (remaining?.tabs[0]) {
          selectTab(remaining.tabs[0].id);
        }
        break;
      }
    }
    setPendingConfirm(null);
  };

  const needsAccount = activeTab.widgets.some(widgetNeedsAccount);
  const needsHistory = activeTab.widgets.some(widgetNeedsHistory);

  const tabBar = (
    <div className='flex min-w-0 items-center gap-2'>
      <DashboardTabs
        activeTabId={activeTab.id}
        brokenTabIds={brokenTabIds}
        editing={editing}
        onAddTab={addTabFrom}
        onDeleteTab={(tab) =>
          tab.widgets.length === 0
            ? editDraft((current) => removeTab(current, tab.id))
            : setPendingConfirm({ kind: "deleteTab", tab })
        }
        onMoveTab={(tabId, offset) =>
          editDraft((current) => moveTab(current, tabId, offset))
        }
        onRenameTab={(tabId, title) =>
          editDraft((current) =>
            updateTab(current, tabId, { title: title.trim() || null }),
          )
        }
        onSelect={selectTab}
        onTabIcon={(tabId, icon) =>
          editDraft((current) => updateTab(current, tabId, { icon }))
        }
        tabs={layout.tabs}
      />
      {!editing && (
        <Button
          className='h-9 shrink-0 gap-1.5 rounded-full'
          data-testid='stats-customize'
          onClick={startEditing}
          size='sm'
          title={t("stats.dashboard.customizeHint")}
          variant='outline'>
          <Pencil className='h-3.5 w-3.5' />
          {t("stats.dashboard.customize")}
        </Button>
      )}
    </div>
  );

  const renderBody = () => {
    if (!editing) {
      if (needsAccount && accountsPending) {
        return <StatsSkeleton />;
      }
      if (needsAccount && !hasAccount) {
        return <AccountPrompt onSubmit={setAccountId} />;
      }
      if (needsHistory && stats.isPending) {
        return <StatsSkeleton />;
      }
      if (needsHistory && stats.isError) {
        return (
          <Empty className='py-16'>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <TriangleAlert className='h-16 w-16' />
              </EmptyMedia>
              <EmptyTitle>{t("stats.errorTitle")}</EmptyTitle>
              <EmptyDescription>{t("stats.errorDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        );
      }
      if (needsHistory && stats.matches.length === 0) {
        return (
          <Empty className='py-16'>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <Users className='h-16 w-16' />
              </EmptyMedia>
              <EmptyTitle>{t("stats.noMatchesTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("stats.noMatchesDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        );
      }
      if (activeTab.widgets.length === 0) {
        return (
          <Empty className='py-16'>
            <EmptyHeader>
              <EmptyMedia variant='default'>
                <LayoutGrid className='h-16 w-16' />
              </EmptyMedia>
              <EmptyTitle>{t("stats.dashboard.emptyTabTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("stats.dashboard.emptyTabDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button className='gap-1.5' onClick={startEditing}>
                <Pencil className='h-4 w-4' />
                {t("stats.dashboard.customize")}
              </Button>
            </EmptyContent>
          </Empty>
        );
      }
    }

    return (
      <DashboardGrid
        actions={gridActions}
        editing={editing}
        onAddWidget={() =>
          setEditorTarget({ tabId: activeTab.id, widget: null })
        }
        onHealth={handleHealth}
        tab={activeTab}
        tabs={layout.tabs}
      />
    );
  };

  const showAccountPrompt =
    !editing && needsAccount && !accountsPending && !hasAccount;

  return (
    <DashboardDataProvider
      value={{
        accountId,
        stats,
        heroesById,
        rankAssets: rankAssets.data?.data ?? [],
      }}>
      <div className='flex h-full min-h-0 w-full flex-col'>
        {/* Status (freshness, attribution, match sharing) takes the title row's
            empty right side, so the row below only has to fit account and tabs. */}
        <div className='flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pr-2'>
          <PageTitle subtitle={t("stats.subtitle")} title={t("stats.title")} />
          <StatsStatus
            freshness={
              hasAccount
                ? {
                    fetchedAt: stats.fetchedAt,
                    isStale: stats.isStale,
                    isRefreshing,
                    canRefresh,
                    onRefresh: refresh,
                  }
                : undefined
            }
          />
        </div>

        {/* Account and tabs share one pinned row - the tabs are the page's
            primary navigation and shouldn't cost a band of their own. Without a
            detected account the live tab still works, so the switcher stands on
            its own. */}
        <div className='flex shrink-0 flex-col gap-3 px-4 pr-2 pt-4 pb-4'>
          {hasAccount ? (
            <StatsHeader
              account={account}
              accountId={accountId}
              accounts={accounts}
              onSelectAccount={setAccountId}
              profile={stats.profile}
              rank={stats.rank}
              rankAssets={rankAssets.data?.data ?? []}
              tabs={tabBar}
            />
          ) : (
            tabBar
          )}
          {editing && (
            <EditToolbar
              isDirty={isDirty}
              onAddWidget={() =>
                setEditorTarget({ tabId: activeTab.id, widget: null })
              }
              onCancel={cancel}
              onReset={() => setPendingConfirm({ kind: "reset" })}
              onSave={save}
            />
          )}
          {recovered && !editing && (
            <Alert variant='warning'>
              <TriangleAlert className='h-4 w-4' />
              <AlertDescription>
                {t("stats.dashboard.recovered")}
              </AlertDescription>
            </Alert>
          )}
          {hasAccount && !editing && (
            <StatsHints
              apiMatchIds={stats.matches.map((match) => match.match_id)}
            />
          )}
          {hasAccount && stats.isStale && (
            <Alert variant='warning'>
              <TriangleAlert className='h-4 w-4' />
              <AlertDescription>{t("stats.staleWarning")}</AlertDescription>
            </Alert>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-4 pr-2",
            // The account prompt is a centred card; every tab body is a full page.
            showAccountPrompt && "flex items-center justify-center",
          )}>
          {renderBody()}
        </div>
      </div>

      {editorTarget && (
        <WidgetEditor
          initial={editorTarget.widget}
          onOpenChange={(open) => !open && setEditorTarget(null)}
          onSave={(widget) => {
            editDraft((current) =>
              upsertWidget(current, editorTarget.tabId, widget),
            );
            setEditorTarget(null);
          }}
          open
        />
      )}

      <ConfirmDialog
        confirmLabel={t(
          pendingConfirm?.kind === "deleteTab"
            ? "stats.dashboard.confirm.deleteTabAction"
            : pendingConfirm?.kind === "reset"
              ? "stats.dashboard.confirm.resetAction"
              : "stats.dashboard.confirm.discardAction",
        )}
        description={
          pendingConfirm?.kind === "deleteTab"
            ? t("stats.dashboard.confirm.deleteTabDescription", {
                tab: tabTitle(pendingConfirm.tab),
                count: pendingConfirm.tab.widgets.length,
              })
            : t(
                pendingConfirm?.kind === "reset"
                  ? "stats.dashboard.confirm.resetDescription"
                  : "stats.dashboard.confirm.discardDescription",
              )
        }
        onConfirm={confirmPending}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        open={pendingConfirm !== null}
        title={t(
          pendingConfirm?.kind === "deleteTab"
            ? "stats.dashboard.confirm.deleteTabTitle"
            : pendingConfirm?.kind === "reset"
              ? "stats.dashboard.confirm.resetTitle"
              : "stats.dashboard.confirm.discardTitle",
        )}
      />
    </DashboardDataProvider>
  );
};

export default Stats;
