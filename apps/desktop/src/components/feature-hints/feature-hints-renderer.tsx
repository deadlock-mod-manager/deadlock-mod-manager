import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics";
import { canShowHint, HINT_IDLE_MS, hintPriority } from "@/lib/feature-hints";
import { useFeatureHintsSession } from "@/lib/feature-hints-session";
import { useLaunchProgress } from "@/lib/launch-progress";
import { usePersistedStore } from "@/lib/store";

const IDLE_RESET_EVENTS = ["pointerdown", "keydown", "wheel"] as const;

/**
 * Picks at most one feature hint per session, once the page has been idle for
 * a moment and nothing more important (a dialog, an open menu, a launch, or
 * the game itself) has the user's attention.
 */
export const FeatureHintsRenderer = () => {
  const queryClient = useQueryClient();
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const hasCandidates = useFeatureHintsSession(
    (state) => state.candidates.length > 0,
  );
  const canSchedule = useFeatureHintsSession(
    (state) => state.active === null && !state.shownThisSession,
  );

  useEffect(() => {
    if (hasCompletedOnboarding) {
      usePersistedStore.getState().startFeatureHints();
    }
  }, [hasCompletedOnboarding]);

  useEffect(() => {
    if (!hasCandidates || !canSchedule) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const isBusy = () =>
      document.hidden ||
      useLaunchProgress.getState().progress !== null ||
      queryClient.getQueryData<boolean>(["is-game-running"]) === true ||
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [role="menu"]',
      ) !== null;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(showNext, HINT_IDLE_MS);
    };

    const showNext = () => {
      if (isBusy()) {
        schedule();
        return;
      }
      const now = Date.now();
      const store = usePersistedStore.getState();
      const session = useFeatureHintsSession.getState();
      const [next] = session.candidates
        .filter((id) => canShowHint(id, store.featureHints, now))
        .sort((a, b) => hintPriority(a) - hintPriority(b));
      if (!next) return;
      session.activate(next);
      analytics.track("feature_hint_shown", { hint_id: next });
    };

    schedule();
    for (const event of IDLE_RESET_EVENTS) {
      window.addEventListener(event, schedule, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const event of IDLE_RESET_EVENTS) {
        window.removeEventListener(event, schedule);
      }
    };
  }, [hasCandidates, canSchedule, queryClient]);

  return null;
};
