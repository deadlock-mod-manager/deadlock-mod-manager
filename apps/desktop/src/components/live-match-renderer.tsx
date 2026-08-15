import { useEffect } from "react";
import { usePlayerStatsEnabled } from "@/hooks/use-feature-flags";
import { useLiveMatch } from "@/hooks/use-live-match";
import {
  disconnectLiveStream,
  hydrateLiveStream,
} from "@/lib/stats/live-store";

const LiveMatchWatcher = () => {
  // Before anything else the component does: the board saved by the last
  // session is on screen while detection is still deciding whether that match
  // is over or, after a restart mid-round, still running.
  useEffect(() => {
    void hydrateLiveStream();
  }, []);

  useLiveMatch();

  // The only teardown there is; it writes the board out one last time.
  // Everything else deliberately keeps running while the app is open, so the
  // Live tab always opens onto current data.
  useEffect(() => disconnectLiveStream, []);

  return null;
};

/**
 * Follows the running match app-wide instead of only while the Stats page is
 * open: the console log is scanned, the broadcast resolved and the scoreboard
 * streamed in the background, so clicking the Live tab shows the match as it
 * stands rather than reconnecting from scratch. It also means the match charts
 * cover the whole round and not just the part the tab was open for.
 */
export const LiveMatchRenderer = () => {
  const { isEnabled } = usePlayerStatsEnabled();

  // Nothing to follow for anyone who cannot reach the page.
  return isEnabled ? <LiveMatchWatcher /> : null;
};
