import { useState } from "react";
import { MatchSyncHint } from "@/components/stats/match-sync-hint";
import { PatronHint } from "@/components/stats/patron-hint";
import { useMissingLocalMatches } from "@/hooks/use-live-match";
import { useMatchSync } from "@/hooks/use-match-sync";
import { usePersistedStore } from "@/lib/store";

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
  const patronHintDismissed = usePersistedStore(
    (state) => state.patronHintDismissed,
  );
  const dismissPatronHint = usePersistedStore(
    (state) => state.dismissPatronHint,
  );

  const { status } = useMatchSync();
  // Explicitly false, not just absent: while the status loads, nothing is known
  // and a hint would only flash.
  const syncDisabled = status?.enabled === false;
  const missingLocal = useMissingLocalMatches(apiMatchIds, syncDisabled);

  if (syncDisabled && !syncHintDismissed) {
    return (
      <MatchSyncHint
        missingCount={missingLocal.length}
        onDismiss={() => setSyncHintDismissed(true)}
      />
    );
  }

  if (!patronHintDismissed) {
    return <PatronHint onDismiss={dismissPatronHint} />;
  }

  return null;
};
