import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { REFETCH_INTERVAL_REMOTE_INSTALL } from "@/lib/query-constants";
import type { GameBananaMember } from "@/types/generated/GameBananaMember";
import type { DeepLinkData, OneClickInstall } from "./use-deep-link";

const PAIR_EVENT = "remote-install-pair-requested";
const STATUS_KEY = ["remote-install", "status"];
// Names and avatars rarely change; refresh them about once an hour.
const STALE_TIME_MEMBER = 60 * 60 * 1000;

// GameBanana marks entries retrieved once returned, so every fetch, including
// a manual refetch from Settings or the status bar, must install what it gets.
// The app-wide poller registers the installer before its first fetch.
let installLink: OneClickInstall | null = null;

const queueQuery = queryOptions({
  queryKey: ["remote-install", "queue"],
  queryFn: async () => {
    const links = await invoke<DeepLinkData[]>("poll_remote_install");
    for (const link of links) {
      void installLink?.(link, "remote_install");
    }
    return links;
  },
});

export const useRemoteInstallStatus = () =>
  useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => invoke<number | null>("get_remote_install_status"),
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

/** Shares the poller's queue state without fetching on its own. */
const useRemoteInstallQueueState = () =>
  useQuery({ ...queueQuery, enabled: false });

type RemoteInstallState = "unpaired" | "failed" | "linked";

export const useRemoteInstallSummary = () => {
  const { t } = useTranslation();
  const status = useRemoteInstallStatus();
  const queue = useRemoteInstallQueueState();
  const memberId = status.data ?? null;
  const state: RemoteInstallState =
    memberId == null ? "unpaired" : queue.isError ? "failed" : "linked";
  const lastCheckedLabel = queue.isFetching
    ? t("remoteInstall.indicatorChecking")
    : queue.dataUpdatedAt
      ? t("remoteInstall.lastChecked", {
          time: formatDistanceToNow(new Date(queue.dataUpdatedAt), {
            addSuffix: true,
          }),
        })
      : t("remoteInstall.notCheckedYet");

  return { status, queue, memberId, state, lastCheckedLabel };
};

export const useRemoteInstallPairing = () => {
  const queryClient = useQueryClient();
  const onSettled = () => {
    queryClient.invalidateQueries({ queryKey: STATUS_KEY });
    queryClient.removeQueries({ queryKey: queueQuery.queryKey });
  };

  const pair = useMutation({
    mutationFn: () => invoke<void>("confirm_remote_install_pair"),
    onSettled,
  });
  const unpair = useMutation({
    mutationFn: () => invoke<void>("unpair_remote_install"),
    onSettled,
  });

  return { pair, unpair };
};

// GameBanana's Pair button opens the app with the member's key. Any page can
// fire that link, so Rust holds the key until the user confirms the member.
export const useRemoteInstallPairRequest = () => {
  const [memberId, setMemberId] = useState<number | null>(null);

  useEffect(() => {
    const unlisten = listen<{ memberId: number }>(PAIR_EVENT, (event) =>
      setMemberId(event.payload.memberId),
    );
    return () => {
      unlisten.then((dispose) => dispose()).catch(() => undefined);
    };
  }, []);

  return { memberId, dismiss: () => setMemberId(null) };
};

export const useRemoteInstallPoll = (installFromLink: OneClickInstall) => {
  const { data: memberId } = useRemoteInstallStatus();
  useEffect(() => {
    installLink = installFromLink;
    return () => {
      installLink = null;
    };
  }, [installFromLink]);
  useQuery({
    ...queueQuery,
    enabled: memberId != null,
    refetchInterval: REFETCH_INTERVAL_REMOTE_INSTALL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: false,
  });
};
