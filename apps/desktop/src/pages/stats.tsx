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
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import PageTitle from "@/components/shared/page-title";
import {
  AccountSwitcher,
  accountDisplayName,
  PlayerAvatar,
} from "@/components/stats/account-switcher";
import { AccountPrompt } from "@/components/stats/account-prompt";
import { DashboardDataProvider } from "@/components/stats/dashboard/dashboard-context";
import { DashboardGrid } from "@/components/stats/dashboard/dashboard-grid";
import { DashboardTabs } from "@/components/stats/dashboard/dashboard-tabs";
import {
  EditToolbar,
  PendingConfirmDialog,
} from "@/components/stats/dashboard/dashboard-toolbar";
import { useDashboardEditor } from "@/components/stats/dashboard/use-dashboard-editor";
import { WidgetEditor } from "@/components/stats/dashboard/widget-editor";
import {
  widgetNeedsAccount,
  widgetNeedsHistory,
} from "@/components/stats/dashboard/widget-requirements";
import { StatsFilters } from "@/components/stats/stats-filters";
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
import { DEFAULT_TAB_IDS } from "@/lib/stats/dashboard/layout";
import {
  statsSinceTimestamp,
  type StatsMatchMode,
  type StatsScope,
} from "@/lib/stats/scope";
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

const CUSTOMIZE_HINT_MIN_VISITS = 5;

const Stats = () => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const dashboard = useDashboardEditor();
  const { activeTab, editing } = dashboard;
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const statsVisits = usePersistedStore(
    (state) => state.featureHints.counters.statsVisits ?? 0,
  );
  const startEditing = () => {
    dashboard.startEditing();
    markFeatureUsed("stats-customize");
  };

  useEffect(() => {
    usePersistedStore.getState().countFeatureHintEvent("statsVisits");
  }, []);

  const {
    accounts,
    account,
    accountId,
    isPending: accountsPending,
    setAccountId,
  } = useSelectedSteamAccount();
  const hasAccount = accountId !== null;
  const [mode, setMode] = useState<StatsMatchMode>("all");
  const [sinceDate, setSinceDate] = useState("");
  const scope = useMemo<StatsScope>(
    () => ({ mode, since: statsSinceTimestamp(sinceDate) }),
    [mode, sinceDate],
  );
  const stats = usePlayerStats(accountId, scope);
  const { heroesById } = useHeroCatalog();
  const rankAssets = useRankAssets();
  const { refresh, isRefreshing, canRefresh } = useStatsRefresh();

  useEffect(() => {
    // Custom tab ids are random; one bucket keeps the page-view report readable.
    const tab = DEFAULT_TAB_IDS.has(activeTab.id) ? activeTab.id : "custom";
    analytics.trackPageViewed(`stats-${tab}`, { tab });
  }, [analytics, activeTab.id]);

  // Gate the whole page only when no widget could render without it; mixed
  // tabs fall through to the grid and each widget shows its own notice.
  const hasWidgets = activeTab.widgets.length > 0;
  const needsAccount =
    hasWidgets && activeTab.widgets.every(widgetNeedsAccount);
  const needsHistory =
    hasWidgets && activeTab.widgets.every(widgetNeedsHistory);

  const tabBar = (
    <DashboardTabs
      activeTabId={activeTab.id}
      brokenTabIds={dashboard.brokenTabIds}
      counts={{ heroes: hasAccount ? stats.heroes.length : undefined }}
      editing={editing}
      onSelect={dashboard.selectTab}
      tabs={dashboard.layout.tabs}
      {...dashboard.tabActions}
    />
  );

  const customize = (
    <HintAnchor
      align='end'
      eligible={statsVisits >= CUSTOMIZE_HINT_MIN_VISITS}
      hintId='stats-customize'
      onShowMe={startEditing}>
      <Button
        className='h-9 shrink-0 gap-2 rounded-lg font-semibold'
        data-testid='stats-customize'
        onClick={startEditing}
        size='sm'
        title={t("stats.dashboard.customizeHint")}
        variant='outline'>
        <Pencil className='h-3.5 w-3.5 text-muted-foreground' />
        {t("stats.dashboard.customize")}
      </Button>
    </HintAnchor>
  );

  const renderBody = () => {
    const grid = (
      <DashboardGrid
        actions={dashboard.gridActions}
        editing={editing}
        onAddWidget={dashboard.addWidget}
        onHealth={dashboard.reportHealth}
        tab={activeTab}
        tabs={dashboard.layout.tabs}
      />
    );
    if (editing) {
      return grid;
    }
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
    if (needsHistory && stats.allMatches.length === 0) {
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
    if (!hasWidgets) {
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
    return grid;
  };

  const displayName = accountDisplayName(stats.profile, account);
  const showsProfile = activeTab.widgets.some(
    (widget) =>
      widget.source.kind === "panel" && widget.source.panel === "profile",
  );

  const showAccountPrompt =
    !editing && needsAccount && !accountsPending && !hasAccount;

  return (
    <DashboardDataProvider
      value={{
        accountId,
        account,
        accounts,
        onSelectAccount: setAccountId,
        scope,
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

        {/* Tabs and filters share one pinned row. The account lives in the
            Overview's profile panel; tabs without one get a compact chip so
            switching accounts is always one click away. */}
        <div className='flex shrink-0 flex-col gap-3 px-4 pr-2 pt-4 pb-4'>
          <div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-3'>
            <div className='flex min-w-0 items-center gap-3'>
              {hasAccount && !showsProfile && (
                <div className='flex min-w-0 items-center gap-2 rounded-lg border border-border/60 py-1 pr-1 pl-1.5'>
                  <PlayerAvatar
                    className='h-6 w-6'
                    name={displayName}
                    profile={stats.profile}
                  />
                  <span className='max-w-40 truncate font-medium text-sm'>
                    {displayName || t("stats.unknownPlayer")}
                  </span>
                  <AccountSwitcher
                    accounts={accounts}
                    onSelectAccount={setAccountId}
                  />
                </div>
              )}
              {tabBar}
            </div>
            {!editing && (
              <div className='flex flex-wrap items-center gap-2'>
                <StatsFilters
                  mode={mode}
                  onModeChange={setMode}
                  onSinceDateChange={setSinceDate}
                  sinceDate={sinceDate}
                />
                {customize}
              </div>
            )}
          </div>
          {editing && (
            <EditToolbar
              isDirty={dashboard.isDirty}
              onAddWidget={dashboard.addWidget}
              onCancel={dashboard.cancel}
              onReset={dashboard.requestReset}
              onSave={dashboard.save}
            />
          )}
          {dashboard.recovered && !editing && (
            <Alert variant='warning'>
              <TriangleAlert className='h-4 w-4' />
              <AlertDescription>
                {t("stats.dashboard.recovered")}
              </AlertDescription>
            </Alert>
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
        {hasAccount && !editing && (
          <div className='shrink-0 px-4 py-3 pr-2 empty:hidden'>
            <StatsHints
              apiMatchIds={stats.allMatches.map((match) => match.match_id)}
            />
          </div>
        )}
      </div>

      {dashboard.editorTarget && (
        <WidgetEditor
          initial={dashboard.editorTarget.widget}
          onOpenChange={(open) => !open && dashboard.closeEditor()}
          onSave={dashboard.saveWidget}
          open
        />
      )}

      <PendingConfirmDialog
        onConfirm={dashboard.confirm}
        onDismiss={dashboard.dismissConfirm}
        pending={dashboard.pendingConfirm}
      />
    </DashboardDataProvider>
  );
};

export default Stats;
