import { useEffect, useRef, useState } from "react";
import { MatchSyncEnabledNote } from "@/components/stats/match-sync-enabled-note";
import { MatchSyncHint } from "@/components/stats/match-sync-hint";
import { PatronHint } from "@/components/stats/patron-hint";
import { useMissingLocalMatches } from "@/hooks/use-live-match";
import { useMatchSync } from "@/hooks/use-match-sync";
import { usePersistedStore } from "@/lib/store";

/** Long enough to read the confirmation, short enough not to linger. */
const ENABLED_NOTE_MS = 5000;

interface StatsHintsProps {
  /** Match ids the API already knows about, to spot what it is still missing. */
  apiMatchIds: number[];
}

/**
 * Which nudge the Stats page shows, if any. One at a time and the free,
 * actionable one first - two banners stacked above the numbers is worse than no
 * banner at all. Owning the decision here keeps the page itself from knowing
 * anything about match sync or Patreon.
 */
export const StatsHints = ({ apiMatchIds }: StatsHintsProps) => {
  const [syncHintDismissed, setSyncHintDismissed] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const wasDisabled = useRef(false);
  const patronHintDismissed = usePersistedStore(
    (state) => state.patronHintDismissed,
  );
  const dismissPatronHint = usePersistedStore(
    (state) => state.dismissPatronHint,
  );

  const { status } = useMatchSync();
  const enabled = status?.enabled;
  // Explicitly false, not just absent: while the status loads, nothing is known
  // and a hint would only flash.
  const syncDisabled = enabled === false;
  const missingLocal = useMissingLocalMatches(apiMatchIds, syncDisabled);

  // Only an off -> on flip seen on this page earns the confirmation; arriving
  // with sharing already on is not news.
  useEffect(() => {
    if (enabled === undefined) {
      return;
    }
    if (!enabled) {
      wasDisabled.current = true;
      setJustEnabled(false);
      return;
    }
    if (!wasDisabled.current) {
      return;
    }
    wasDisabled.current = false;
    setJustEnabled(true);
    const timer = window.setTimeout(
      () => setJustEnabled(false),
      ENABLED_NOTE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (syncDisabled && !syncHintDismissed) {
    return (
      <MatchSyncHint
        missingCount={missingLocal.length}
        onDismiss={() => setSyncHintDismissed(true)}
      />
    );
  }

  if (justEnabled) {
    return <MatchSyncEnabledNote />;
  }

  if (!patronHintDismissed) {
    return <PatronHint onDismiss={dismissPatronHint} />;
  }

  return null;
};
