import {
  Activity,
  CalendarClock,
  ChartLine,
  Gauge,
  LayoutGrid,
  Lightbulb,
  ListOrdered,
  Package,
  Radio,
  Sword,
  Swords,
  Trophy,
  UserRound,
  Users,
} from "@deadlock-mods/ui/icons";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FormChart } from "@/components/stats/form-chart";
import { HeroPool } from "@/components/stats/hero-pool";
import { HeroesTab } from "@/components/stats/heroes-tab";
import { InsightList } from "@/components/stats/insight-list";
import { ItemsTab } from "@/components/stats/items-tab";
import { LiveBridgeNotice } from "@/components/stats/live-bridge-notice";
import { LiveScoreboard } from "@/components/stats/live-scoreboard";
import { LiveTabIcon, LiveToolbar } from "@/components/stats/live-toolbar";
import { OverviewTiles } from "@/components/stats/overview-tiles";
import { ProfilePanel } from "@/components/stats/profile-panel";
import { RankBenchmark } from "@/components/stats/rank-benchmark";
import { RankChart } from "@/components/stats/rank-chart";
import { RecentMatches } from "@/components/stats/recent-matches";
import { SessionChart } from "@/components/stats/session-chart";
import { SquadTab } from "@/components/stats/squad-tab";
import { TrendStrip } from "@/components/stats/trend-strip";
import {
  useBracketBenchmark,
  useItemStats,
  useSquadStats,
} from "@/hooks/use-player-stats";
import { resolveRank } from "@/lib/stats/api";
import type { DashboardTab } from "@/lib/stats/dashboard/layout";
import { summarize } from "@/lib/stats/derive";
import { type DashboardData, useDashboardData } from "./dashboard-context";
import {
  ChartSkeleton,
  HeroesSkeleton,
  InsightsSkeleton,
  ItemsSkeleton,
  ListSkeleton,
  ProfileSkeleton,
  RankSkeleton,
  SquadSkeleton,
  TilesSkeleton,
  TrendsSkeleton,
} from "./panel-skeletons";

/**
 * The hand-built sections of the original Stats tabs, placeable like any other
 * widget. They keep their own layout and interactions (hero selection, player
 * cards), so the editor offers them as a whole rather than as chart options.
 */
export const PANEL_IDS = [
  "profile",
  "trends",
  "tiles",
  "insights",
  "form",
  "session",
  "rank",
  "benchmark",
  "recentMatches",
  "heroPool",
  "heroes",
  "items",
  "squad",
  "liveScoreboard",
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

type AccountData = DashboardData & { accountId: number };

/** The frame gates account and history, so `render` only runs once both are there. */
type PanelDef = {
  icon: ComponentType<{ className?: string }>;
  needsHistory: boolean;
  /** How a tab that holds nothing but this panel stands apart in the tab row. */
  tab?: {
    /** Drawn in place of the tab's own icon. */
    icon: ComponentType<{ className?: string }>;
    activeClassName: string;
    /** Takes the place of the page's filters, which mean nothing to the panel. */
    toolbar: ComponentType;
  };
  /** Shaped like the panel's cards, so the page keeps its layout while loading. */
  skeleton: () => ReactNode;
} & (
  | { needsAccount: true; render: (data: AccountData) => ReactNode }
  | { needsAccount: false; render: (data: DashboardData) => ReactNode }
);

const ItemsPanel = ({ accountId }: { accountId: number }) => {
  const { scope } = useDashboardData();
  const itemStats = useItemStats(accountId, true, scope);
  return (
    <ItemsTab
      isPending={itemStats.isPending}
      items={itemStats.items}
      itemsById={itemStats.itemsById}
    />
  );
};

/** The rank bracket both bracket panels compare with; one shared request. */
const useBracket = () => {
  const { stats, scope, rankAssets } = useDashboardData();
  const benchmark = useBracketBenchmark(stats, scope);
  const bracketName =
    benchmark.tier === null
      ? null
      : (resolveRank(benchmark.tier * 10 + 1, rankAssets).name ?? null);
  return { ...benchmark, bracketName };
};

const TrendsPanel = () => {
  const { stats } = useDashboardData();
  const { rows, bracketName } = useBracket();
  return (
    <TrendStrip
      bracket={rows}
      bracketName={bracketName}
      matches={stats.matches}
    />
  );
};

const BenchmarkPanel = () => {
  const { rows, bracketName, isPending, isError } = useBracket();
  return (
    <RankBenchmark
      bracketName={bracketName}
      isError={isError}
      isPending={isPending}
      rows={rows}
    />
  );
};

const SquadPanel = () => {
  const { accountId, stats, heroesById, rankAssets } = useDashboardData();
  const { t } = useTranslation();
  const squad = useSquadStats(accountId, stats.allMatches);
  if (squad.isPending) {
    return <SquadSkeleton />;
  }
  return (
    <div className='flex flex-col gap-2'>
      <p className='text-muted-foreground text-xs'>{t("stats.scope.squad")}</p>
      <SquadTab
        careerWinrate={summarize(stats.allMatches).winrate}
        enemies={squad.enemies}
        heroStatsById={squad.heroStatsById}
        heroesById={heroesById}
        mates={squad.mates}
        partyIds={squad.partyIds}
        profilesById={squad.profilesById}
        rankAssets={rankAssets}
      />
    </div>
  );
};

const LiveScoreboardPanel = () => {
  const { accountId, stats, heroesById, rankAssets, scope } =
    useDashboardData();
  return (
    <div className='flex flex-col gap-4'>
      <LiveBridgeNotice />
      <LiveScoreboard
        heroesById={heroesById}
        rankAssets={rankAssets}
        scope={scope}
        you={{ accountId, rank: stats.rank, matches: stats.allMatches }}
      />
    </div>
  );
};

const PANELS = {
  profile: {
    icon: UserRound,
    skeleton: ProfileSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ account, accounts, onSelectAccount, stats, rankAssets }) => (
      <ProfilePanel
        account={account}
        accounts={accounts}
        heroes={stats.heroes}
        matches={stats.matches}
        onSelectAccount={onSelectAccount}
        profile={stats.profile}
        rank={stats.rank}
        rankAssets={rankAssets}
      />
    ),
  },
  trends: {
    icon: Activity,
    skeleton: TrendsSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: () => <TrendsPanel />,
  },
  tiles: {
    icon: LayoutGrid,
    skeleton: TilesSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats }) => <OverviewTiles matches={stats.matches} />,
  },
  insights: {
    icon: Lightbulb,
    skeleton: InsightsSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <InsightList heroesById={heroesById} insights={stats.insights} />
    ),
  },
  form: {
    icon: ChartLine,
    skeleton: ChartSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <FormChart heroesById={heroesById} matches={stats.matches} />
    ),
  },
  session: {
    icon: CalendarClock,
    skeleton: ChartSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats }) => <SessionChart matches={stats.matches} />,
  },
  rank: {
    icon: Trophy,
    skeleton: RankSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, rankAssets }) => (
      <RankChart matches={stats.matches} rankAssets={rankAssets} />
    ),
  },
  benchmark: {
    icon: Gauge,
    skeleton: () => <ListSkeleton rows={4} />,
    needsAccount: true,
    needsHistory: true,
    render: () => <BenchmarkPanel />,
  },
  recentMatches: {
    icon: ListOrdered,
    skeleton: () => <ListSkeleton rows={6} />,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <RecentMatches heroesById={heroesById} matches={stats.matches} />
    ),
  },
  heroPool: {
    icon: Swords,
    skeleton: () => <ListSkeleton rows={6} />,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <HeroPool heroes={stats.heroes} heroesById={heroesById} />
    ),
  },
  heroes: {
    icon: Sword,
    skeleton: HeroesSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <HeroesTab
        benchmarkFor={stats.benchmarkFor}
        careerWinrate={summarize(stats.matches).winrate}
        heroes={stats.heroes}
        heroesById={heroesById}
      />
    ),
  },
  items: {
    icon: Package,
    skeleton: ItemsSkeleton,
    needsAccount: true,
    needsHistory: false,
    render: ({ accountId }) => <ItemsPanel accountId={accountId} />,
  },
  squad: {
    icon: Users,
    skeleton: SquadSkeleton,
    needsAccount: true,
    needsHistory: true,
    render: () => <SquadPanel />,
  },
  liveScoreboard: {
    icon: Radio,
    skeleton: () => <ListSkeleton rows={6} />,
    // Read from the running game's console log, so no account is involved.
    needsAccount: false,
    needsHistory: false,
    tab: {
      icon: LiveTabIcon,
      activeClassName:
        "data-[state=active]:has-[[data-live]]:border-red-400/25",
      toolbar: LiveToolbar,
    },
    render: () => <LiveScoreboardPanel />,
  },
} satisfies Record<PanelId, PanelDef>;

const isPanelId = (id: string): id is PanelId =>
  PANEL_IDS.some((panel) => panel === id);

export const panelDef = (id: string): PanelDef | undefined =>
  isPanelId(id) ? PANELS[id] : undefined;

/** The panel `tab` is devoted to: every widget on it is that one panel. */
export const tabPanel = (tab: DashboardTab): PanelDef | undefined => {
  const [first, ...rest] = tab.widgets;
  if (first?.source.kind !== "panel") return undefined;
  const panel = first.source.panel;
  return rest.every(
    (widget) => widget.source.kind === "panel" && widget.source.panel === panel,
  )
    ? panelDef(panel)
    : undefined;
};
