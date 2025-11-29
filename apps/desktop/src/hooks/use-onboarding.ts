import { useCallback } from "react";
import { usePersistedStore } from "@/lib/store";

export const useOnboarding = () => {
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const setHasCompletedOnboarding = usePersistedStore(
    (state) => state.setHasCompletedOnboarding,
  );

  const showOnboarding = !hasCompletedOnboarding;

  const completeOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, [setHasCompletedOnboarding]);

  const skipOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, [setHasCompletedOnboarding]);

  return {
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
  };
};
