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
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/shared/page-title";
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

const Stats = () => {
  const { t } = useTranslation();
  const { analytics } = useAnalyticsContext();
  const dashboard = useDashboardEditor();
  const { activeTab, editing } = dashboard;

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

  const needsAccount = activeTab.widgets.some(widgetNeedsAccount);
  const needsHistory = activeTab.widgets.some(widgetNeedsHistory);

  const tabBar = (
    <div className='flex min-w-0 items-center gap-2'>
      <DashboardTabs
        activeTabId={activeTab.id}
        brokenTabIds={dashboard.brokenTabIds}
        editing={editing}
        onSelect={dashboard.selectTab}
        tabs={dashboard.layout.tabs}
        {...dashboard.tabActions}
      />
      {!editing && (
        <Button
          className='h-9 shrink-0 gap-1.5 rounded-full'
          data-testid='stats-customize'
          onClick={dashboard.startEditing}
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
              <Button className='gap-1.5' onClick={dashboard.startEditing}>
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
        actions={dashboard.gridActions}
        editing={editing}
        onAddWidget={dashboard.addWidget}
        onHealth={dashboard.reportHealth}
        tab={activeTab}
        tabs={dashboard.layout.tabs}
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
