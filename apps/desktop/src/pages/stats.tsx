import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  ChartLine,
  Package,
  Radio,
  Sword,
  TriangleAlert,
  Users,
} from "@deadlock-mods/ui/icons";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import PageTitle from "@/components/shared/page-title";
import { AccountPrompt } from "@/components/stats/account-prompt";
import { HeroesTab } from "@/components/stats/heroes-tab";
import { ItemsTab } from "@/components/stats/items-tab";
import { LiveTab } from "@/components/stats/live-tab";
import { LocalSyncHint } from "@/components/stats/local-sync-hint";
import { OverviewTab } from "@/components/stats/overview-tab";
import { SquadTab } from "@/components/stats/squad-tab";
import { StatsHeader } from "@/components/stats/stats-header";
import { StatTileSkeleton } from "@/components/stats/stat-tile";
import { useAnalyticsContext } from "@/contexts/analytics-context";
import {
  useHeroCatalog,
  useItemStats,
  usePlayerStats,
  useRankAssets,
  useSquadStats,
  useStatsRefresh,
} from "@/hooks/use-player-stats";
import { useMissingLocalMatches } from "@/hooks/use-live-match";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useSelectedSteamAccount } from "@/hooks/use-steam-accounts";
import { ApiKeyDialog } from "@/components/stats/api-key-dialog";
import { setDeadlockApiKey } from "@/lib/stats/api";
import { summarize } from "@/lib/stats/derive";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type StatsTab = "overview" | "heroes" | "items" | "squad" | "live";

const TABS: readonly StatsTab[] = [
  "overview",
  "heroes",
  "items",
  "squad",
  "live",
];

/** Narrows the `?tab=` value and the tab component's `string` callback alike. */
const isStatsTab = (value: string | null): value is StatsTab =>
  TABS.some((tab) => tab === value);

const TAB_TRIGGER_CLASS =
  "h-9 gap-1.5 rounded-full px-6 font-medium text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const deadlockApiKey = usePersistedStore((state) => state.deadlockApiKey);
  const saveDeadlockApiKey = usePersistedStore(
    (state) => state.setDeadlockApiKey,
  );

  // The API client is a plain module, so it has to be told about the key.
  useEffect(() => {
    setDeadlockApiKey(deadlockApiKey);
  }, [deadlockApiKey]);

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<StatsTab>(
    isStatsTab(tabParam) ? tabParam : "overview",
  );

  const {
    accounts,
    account,
    accountId,
    isPending: accountsPending,
    setAccountId,
  } = useSelectedSteamAccount();
  const hasAccount = accountId !== null;
  const stats = usePlayerStats(accountId);
  const squad = useSquadStats(accountId, stats.matches);
  const itemStats = useItemStats(accountId);
  // The console log knows about matches the API has not ingested yet. Filling
  // them in needs the Steam session, which sits behind the match-sync consent.
  const matchSync = useMatchSync();
  const [syncHintDismissed, setSyncHintDismissed] = useState(false);
  const missingLocal = useMissingLocalMatches(
    stats.matches.map((match) => match.match_id),
    hasAccount && !matchSync.status?.enabled,
  );
  const showSyncHint =
    !syncHintDismissed && !matchSync.status?.enabled && missingLocal.length > 0;
  const { heroesById } = useHeroCatalog();
  const rankAssets = useRankAssets();
  const { refresh, isRefreshing, canRefresh } = useStatsRefresh();

  useEffect(() => {
    analytics.trackPageViewed(`stats-${tab}`, { path: "/stats", tab });
  }, [analytics, tab]);

  const handleTabChange = (value: string) => {
    if (!isStatsTab(value)) {
      return;
    }
    setTab(value);
    setSearchParams({ tab: value }, { replace: true });
  };

  const careerWinrate = summarize(stats.matches).winrate;

  const statsTabs = (
    <Tabs className='w-auto' onValueChange={handleTabChange} value={tab}>
      <TabsList className='h-11 rounded-full bg-muted/60 p-1'>
        <TabsTrigger className={TAB_TRIGGER_CLASS} value='overview'>
          <ChartLine className='h-4 w-4' />
          {t("stats.tabs.overview")}
        </TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER_CLASS} value='heroes'>
          <Sword className='h-4 w-4' />
          {t("stats.tabs.heroes")}
        </TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER_CLASS} value='items'>
          <Package className='h-4 w-4' />
          {t("stats.tabs.items")}
        </TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER_CLASS} value='squad'>
          <Users className='h-4 w-4' />
          {t("stats.tabs.squad")}
        </TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER_CLASS} value='live'>
          <Radio className='h-4 w-4' />
          {t("stats.tabs.live")}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const renderBody = () => {
    // The live scoreboard reads the running match from the game, so it works
    // before any history has loaded - and even without a detected account.
    if (tab === "live") {
      return (
        <LiveTab
          heroesById={heroesById}
          ownAccountId={accountId}
          rankAssets={rankAssets.data?.data ?? []}
        />
      );
    }

    if (accountsPending) {
      return <StatsSkeleton />;
    }

    if (!hasAccount) {
      return <AccountPrompt onSubmit={setAccountId} />;
    }

    if (stats.isPending) {
      return <StatsSkeleton />;
    }

    if (stats.isError) {
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

    if (stats.matches.length === 0) {
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

    return (
      <Tabs onValueChange={handleTabChange} value={tab}>
        <TabsContent className='mt-0' value='overview'>
          <OverviewTab
            heroesById={heroesById}
            insights={stats.insights}
            matches={stats.matches}
            mmrHistory={stats.mmrHistory}
          />
        </TabsContent>
        <TabsContent className='mt-0' value='heroes'>
          <HeroesTab
            benchmarkFor={stats.benchmarkFor}
            careerWinrate={careerWinrate}
            heroes={stats.heroes}
            heroesById={heroesById}
          />
        </TabsContent>
        <TabsContent className='mt-0' value='items'>
          <ItemsTab
            isPending={itemStats.isPending}
            items={itemStats.items}
            itemsById={itemStats.itemsById}
          />
        </TabsContent>
        <TabsContent className='mt-0' value='squad'>
          {squad.isPending ? (
            <StatsSkeleton />
          ) : (
            <SquadTab
              careerWinrate={careerWinrate}
              enemies={squad.enemies}
              mates={squad.mates}
              partyIds={squad.partyIds}
              profilesById={squad.profilesById}
            />
          )}
        </TabsContent>
      </Tabs>
    );
  };

  return (
    <div className='flex h-full min-h-0 w-full flex-col'>
      <div className='shrink-0 px-4 pr-2'>
        <PageTitle subtitle={t("stats.subtitle")} title={t("stats.title")} />
      </div>

      {/* Account, tabs and refresh share one pinned row - the tabs are the
          page's primary navigation and shouldn't cost a band of their own.
          Without a detected account there is no header to hang them off, but the
          live tab still works, so the switcher stands on its own. */}
      <div className='flex shrink-0 flex-col gap-3 px-4 pr-2 pt-4 pb-4'>
        {hasAccount ? (
          <StatsHeader
            account={account}
            accountId={accountId}
            accounts={accounts}
            canRefresh={canRefresh}
            center={statsTabs}
            fetchedAt={stats.fetchedAt}
            hasApiKey={deadlockApiKey !== null}
            onOpenApiKey={() => setApiKeyOpen(true)}
            isRefreshing={isRefreshing}
            isStale={stats.isStale}
            onRefresh={refresh}
            onSelectAccount={setAccountId}
            profile={stats.profile}
            rank={stats.rank}
            rankAssets={rankAssets.data?.data ?? []}
          />
        ) : (
          <div className='flex justify-center'>{statsTabs}</div>
        )}
        {showSyncHint && (
          <LocalSyncHint
            missingCount={missingLocal.length}
            onDismiss={() => setSyncHintDismissed(true)}
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
          !hasAccount && tab !== "live" && "flex items-center justify-center",
        )}>
        {renderBody()}
      </div>

      <ApiKeyDialog
        currentKey={deadlockApiKey}
        onOpenChange={setApiKeyOpen}
        onSave={saveDeadlockApiKey}
        open={apiKeyOpen}
      />
    </div>
  );
};

export default Stats;
