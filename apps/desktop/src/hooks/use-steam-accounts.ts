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

/**
 * Remembered Steam accounts, signed-in one first. Resolves to an empty list when
 * Steam is not installed rather than throwing, so callers can offer manual entry.
 */
export const useSteamAccounts = () =>
  useQuery({
    queryKey: STEAM_ACCOUNTS_QUERY_KEY,
    queryFn: () => invoke<SteamAccount[]>("get_steam_accounts"),
    staleTime: STALE_TIME_LOCAL,
    meta: { skipGlobalErrorHandler: true },
  });

/**
 * The account the Stats page works with: the pinned one if the user picked it,
 * otherwise whichever account Steam is currently signed in with.
 */
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

  // A pinned id with no local Steam account behind it is still valid: it may have
  // been typed in by hand.
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
