import { RuntimeError } from "@deadlock-mods/common/client-errors";
import { createContext, type ReactNode, useContext } from "react";
import type { usePlayerStats } from "@/hooks/use-player-stats";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";

/**
 * What every widget on the Stats page reads: the selected account and the one
 * match-history load the whole page shares. Widgets fetch anything beyond that
 * themselves, so a widget nobody placed costs nothing.
 */
export interface DashboardData {
  accountId: number | null;
  stats: ReturnType<typeof usePlayerStats>;
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
}

const DashboardDataContext = createContext<DashboardData | null>(null);

export const DashboardDataProvider = ({
  value,
  children,
}: {
  value: DashboardData;
  children: ReactNode;
}) => (
  <DashboardDataContext.Provider value={value}>
    {children}
  </DashboardDataContext.Provider>
);

export const useDashboardData = (): DashboardData => {
  const value = useContext(DashboardDataContext);
  if (!value) {
    throw new RuntimeError(
      "useDashboardData must be used within DashboardDataProvider",
    );
  }
  return value;
};
