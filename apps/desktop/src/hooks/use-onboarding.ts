import { usePersistedStore } from "@/lib/store";

export const useOnboarding = () => {
  const hasCompletedOnboarding = usePersistedStore(
    (state) => state.hasCompletedOnboarding,
  );
  const setHasCompletedOnboarding = usePersistedStore(
    (state) => state.setHasCompletedOnboarding,
  );

  const showOnboarding = !hasCompletedOnboarding;

  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
  };

  const skipOnboarding = () => {
    setHasCompletedOnboarding(true);
  };

  return {
    showOnboarding,
    completeOnboarding,
    skipOnboarding,
  };
};
