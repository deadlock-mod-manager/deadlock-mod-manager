import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { REFETCH_INTERVAL_REMOTE_INSTALL } from "@/lib/query-constants";
import type { GameBananaMember } from "@/types/generated/GameBananaMember";
import type { RemoteInstallStatus } from "@/types/generated/RemoteInstallStatus";
import type { DeepLinkData, OneClickInstall } from "./use-deep-link";

const PAIR_EVENT = "remote-install-pair-requested";
const STATUS_KEY = ["remote-install", "status"];
const QUEUE_KEY = ["remote-install", "queue"];
// Names and avatars rarely change; refresh them about once an hour.
const STALE_TIME_MEMBER = 60 * 60 * 1000;

export const useRemoteInstallStatus = () =>
  useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => invoke<RemoteInstallStatus>("get_remote_install_status"),
  });

export const useGameBananaMember = (memberId: number | null) =>
  useQuery({
    queryKey: ["gamebanana", "member", memberId],
    queryFn: () =>
      invoke<GameBananaMember>("get_gamebanana_member", { memberId }),
    enabled: memberId != null,
    staleTime: STALE_TIME_MEMBER,
    retry: false,
  });

/**
 * Shares the poller's queue state. Never fetches on its own, so opening
 * Settings does not consume the queue outside the poller.
 */
export const useRemoteInstallQueueState = () =>
  useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => invoke<DeepLinkData[]>("poll_remote_install"),
    enabled: false,
  });

export const useRemoteInstallPairing = () => {
  const queryClient = useQueryClient();
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    queryClient.removeQueries({ queryKey: QUEUE_KEY });
  };

  const pair = useMutation({
    mutationFn: (request: PairRequest) =>
      invoke<RemoteInstallStatus>("pair_remote_install", request),
    onSettled,
  });
  const unpair = useMutation({
    mutationFn: () => invoke<void>("unpair_remote_install"),
    onSettled,
  });

  return { pair, unpair };
};

export type PairRequest = { memberId: number; secretKey: string };

// GameBanana's Pair button opens the app with the member's key. Any page can
// fire that link, so the request waits here until the user confirms it.
export const useRemoteInstallPairRequest = () => {
  const [request, setRequest] = useState<PairRequest | null>(null);

  useEffect(() => {
    const unlisten = listen<PairRequest>(PAIR_EVENT, (event) =>
      setRequest(event.payload),
    );
    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, []);

  return { request, dismiss: () => setRequest(null) };
};

export const useRemoteInstallPoll = (installFromLink: OneClickInstall) => {
  const { data: status } = useRemoteInstallStatus();
  const paired = status?.memberId != null;
  const { data, dataUpdatedAt } = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => invoke<DeepLinkData[]>("poll_remote_install"),
    enabled: paired,
    refetchInterval: REFETCH_INTERVAL_REMOTE_INSTALL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // GameBanana marks entries retrieved once returned, so each response is
  // handled exactly once, keyed by when it arrived.
  const handledAt = useRef(0);
  useEffect(() => {
    if (!data || dataUpdatedAt === handledAt.current) {
      return;
    }
    handledAt.current = dataUpdatedAt;
    for (const link of data) {
      void installFromLink(link, "remote_install");
    }
  }, [data, dataUpdatedAt, installFromLink]);
};
