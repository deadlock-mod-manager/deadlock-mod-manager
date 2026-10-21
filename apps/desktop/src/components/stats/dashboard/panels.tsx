import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  CalendarClock,
  ChartLine,
  LayoutGrid,
  Lightbulb,
  ListOrdered,
  Package,
  Sword,
  Trophy,
  Users,
} from "@deadlock-mods/ui/icons";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FormChart } from "@/components/stats/form-chart";
import { HeroesTab } from "@/components/stats/heroes-tab";
import { InsightList } from "@/components/stats/insight-list";
import { ItemsTab } from "@/components/stats/items-tab";
import { OverviewTiles } from "@/components/stats/overview-tiles";
import { RankChart } from "@/components/stats/rank-chart";
import { RecentMatches } from "@/components/stats/recent-matches";
import { SessionChart } from "@/components/stats/session-chart";
import { SquadTab } from "@/components/stats/squad-tab";
import { useItemStats, useSquadStats } from "@/hooks/use-player-stats";
import { summarize } from "@/lib/stats/derive";
import { type DashboardData, useDashboardData } from "./dashboard-context";

/**
 * The hand-built sections of the original Stats tabs, placeable like any other
 * widget. They keep their own layout and interactions (hero selection, player
 * cards), so the editor offers them as a whole rather than as chart options.
 */
export const PANEL_IDS = [
  "tiles",
  "insights",
  "form",
  "session",
  "rank",
  "recentMatches",
  "heroes",
  "items",
  "squad",
] as const;
export type PanelId = (typeof PANEL_IDS)[number];

type AccountData = DashboardData & { accountId: number };

/** The frame gates account and history, so `render` only runs once both are there. */
type PanelDef = {
  icon: ComponentType<{ className?: string }>;
  needsHistory: boolean;
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

const SquadPanel = () => {
  const { accountId, stats, heroesById, rankAssets } = useDashboardData();
  const { t } = useTranslation();
  const squad = useSquadStats(accountId, stats.allMatches);
  if (squad.isPending) {
    return <Skeleton className='h-[320px] w-full rounded-xl' />;
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

const PANELS = {
  tiles: {
    icon: LayoutGrid,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats }) => <OverviewTiles matches={stats.matches} />,
  },
  insights: {
    icon: Lightbulb,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, heroesById }) => (
      <InsightList heroesById={heroesById} insights={stats.insights} />
    ),
  },
  form: {
    icon: ChartLine,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats }) => <FormChart matches={stats.matches} />,
  },
  session: {
    icon: CalendarClock,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats }) => <SessionChart matches={stats.matches} />,
  },
  rank: {
    icon: Trophy,
    needsAccount: true,
    needsHistory: true,
    render: ({ stats, rankAssets }) => (
      <RankChart matches={stats.matches} rankAssets={rankAssets} />
    ),
  },
  recentMatches: {
    icon: ListOrdered,
    needsAccount: true,
    needsHistory: true,
    render: ({ accountId, stats, heroesById }) => (
      <RecentMatches
        accountId={accountId}
        heroesById={heroesById}
        matches={stats.matches}
      />
    ),
  },
  heroes: {
    icon: Sword,
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
    needsAccount: true,
    needsHistory: false,
    render: ({ accountId }) => <ItemsPanel accountId={accountId} />,
  },
  squad: {
    icon: Users,
    needsAccount: true,
    needsHistory: true,
    render: () => <SquadPanel />,
  },
} satisfies Record<PanelId, PanelDef>;

const isPanelId = (id: string): id is PanelId =>
  PANEL_IDS.some((panel) => panel === id);

export const panelDef = (id: string): PanelDef | undefined =>
  isPanelId(id) ? PANELS[id] : undefined;
