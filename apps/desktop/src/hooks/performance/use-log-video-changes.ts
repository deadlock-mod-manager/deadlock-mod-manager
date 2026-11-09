import { useEffect } from "react";
import { unloggedVideoChanges } from "@/lib/performance/history";
import { videoLabel } from "@/lib/performance/video";
import { usePersistedStore } from "@/lib/store";
import { usePerfStatus } from "./use-perf-queries";

/**
 * Logs video.txt settings changed outside the app (in game, or by Steam Cloud
 * from another PC) to History, once each, when the status shows them. Ones
 * the player chose to keep aren't news.
 */
export const useLogVideoChanges = () => {
  const { data: status } = usePerfStatus();
  const history = usePersistedStore((state) => state.perfHistory);
  const recordPerfHistory = usePersistedStore(
    (state) => state.recordPerfHistory,
  );

  useEffect(() => {
    if (!status?.desired) return;
    const pending = status.video.changed.filter((change) => !change.kept);
    const unlogged = unloggedVideoChanges(history, pending);
    if (unlogged.length === 0) return;
    recordPerfHistory({
      action: "videoChanged",
      changes: unlogged.map(({ key, written, current }) => ({
        key,
        written,
        current,
        label: videoLabel(key),
      })),
    });
  }, [status, history, recordPerfHistory]);
};
