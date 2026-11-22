import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo } from "react";
import { STALE_TIME_LOCAL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";

export type SteamAccount = {
  accountId: number;
  steamId64: string;
  accountName: string;
  personaName: string | null;
  isActive: boolean;
  hasDeadlock: boolean;
  lastSeen: number | null;
};

export const STEAM_ACCOUNTS_QUERY_KEY = ["steam-accounts"] as const;

export const useSteamAccounts = () =>
  useQuery({
    queryKey: STEAM_ACCOUNTS_QUERY_KEY,
    queryFn: () => invoke<SteamAccount[]>("get_steam_accounts"),
    staleTime: STALE_TIME_LOCAL,
    meta: { skipGlobalErrorHandler: true },
  });

export const useSelectedSteamAccount = () => {
  const { data: accounts, isPending, isError } = useSteamAccounts();
  const pinnedAccountId = usePersistedStore((state) => state.statsAccountId);
  const setStatsAccountId = usePersistedStore(
    (state) => state.setStatsAccountId,
  );

  const account = useMemo(() => {
    if (!accounts?.length) return null;
    if (pinnedAccountId !== null) {
      const pinned = accounts.find((a) => a.accountId === pinnedAccountId);
      if (pinned) return pinned;
    }
    return accounts.find((a) => a.isActive) ?? accounts[0];
  }, [accounts, pinnedAccountId]);

  const accountId = account?.accountId ?? pinnedAccountId;

  return {
    accounts: accounts ?? [],
    account,
    accountId,
    isPending,
    isError,
    setAccountId: setStatsAccountId,
  };
};
