import { useEffect } from "react";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useLiveMatch } from "@/hooks/use-live-match";
import { disconnectLiveStream } from "@/lib/stats/live-store";

const LiveMatchWatcher = () => {
  useLiveMatch();

  // The only teardown there is. Everything else deliberately keeps running while
  // the app is open, so the Live tab always opens onto current data.
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
  const { isEnabled } = useFeatureFlag("player-stats", false);

  // Nothing to follow for anyone who cannot reach the page.
  return isEnabled ? <LiveMatchWatcher /> : null;
};
