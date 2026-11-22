import { useEffect, useRef, useState } from "react";
import { MatchSyncEnabledNote } from "@/components/stats/match-sync-enabled-note";
import { MatchSyncHint } from "@/components/stats/match-sync-hint";
import { useMissingLocalMatches } from "@/hooks/use-live-match";
import { useMatchSync } from "@/hooks/use-match-sync";

const ENABLED_NOTE_MS = 5000;

interface StatsHintsProps {
  apiMatchIds: number[];
}

export const StatsHints = ({ apiMatchIds }: StatsHintsProps) => {
  const [syncHintDismissed, setSyncHintDismissed] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);
  const wasDisabled = useRef(false);

  const { status } = useMatchSync();
  const enabled = status?.enabled;
  const syncDisabled = enabled === false;
  const missingLocal = useMissingLocalMatches(apiMatchIds, syncDisabled);

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

  return null;
};
