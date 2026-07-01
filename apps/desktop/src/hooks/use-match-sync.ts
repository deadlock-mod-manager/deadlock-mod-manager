import { toast } from "@deadlock-mods/ui/components/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export type MatchSyncStatus = {
  enabled: boolean;
  consentAccepted: boolean;
  fullSyncRunning: boolean;
  fullSyncComplete: boolean;
  quotaLimit: number;
  quotaRemaining: number;
  quotaResetAt: number | null;
  sessionFetches: number;
};

export type MatchSyncProgress = {
  fetched: number;
  skipped: number;
  backfilled: number;
  running: boolean;
  quotaReached: boolean;
  rateLimited: boolean;
  quotaRemaining: number;
};

const STATUS_KEY = ["match-sync-status"] as const;

export const useMatchSync = () => {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<MatchSyncProgress | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: (): Promise<MatchSyncStatus> =>
      invoke<MatchSyncStatus>("get_match_sync_status"),
    // Poll while a full sync is running so the quota/progress stay current.
    refetchInterval: (query) =>
      query.state.data?.fullSyncRunning ? 2000 : false,
  });

  useEffect(() => {
    const unlistenProgress = listen<MatchSyncProgress>(
      "match-sync-progress",
      (event) => {
        setProgress(event.payload);
        if (!event.payload.running) {
          invalidate();
        }
      },
    );
    const unlistenError = listen<{ message: string }>(
      "match-sync-error",
      (event) => {
        toast.error(event.payload.message);
        invalidate();
      },
    );
    return () => {
      unlistenProgress.then((fn) => fn());
      unlistenError.then((fn) => fn());
    };
  }, []);

  const setConsent = useMutation({
    mutationFn: (accepted: boolean) =>
      invoke("set_match_sync_consent", { accepted }),
    onSuccess: invalidate,
  });
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      invoke("set_match_sync_enabled", { enabled }),
    onSuccess: invalidate,
  });
  const startFullSync = useMutation({
    mutationFn: () => invoke("start_full_match_sync"),
    onSuccess: invalidate,
  });
  const cancelFullSync = useMutation({
    mutationFn: () => invoke("cancel_full_match_sync"),
    onSuccess: invalidate,
  });

  return {
    status: status.data,
    isLoading: status.isLoading,
    progress,
    setConsent,
    setEnabled,
    startFullSync,
    cancelFullSync,
  };
};
