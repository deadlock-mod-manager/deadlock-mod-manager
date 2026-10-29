import { useMemo, useState } from "react";
import {
  buildLiveMock,
  LIVE_MOCK_SCENARIOS,
  LIVE_MOCK_STORAGE_KEY,
  type LiveMockScenario,
} from "@/lib/stats/live-mock";

const isScenario = (value: string | null): value is LiveMockScenario =>
  LIVE_MOCK_SCENARIOS.some((scenario) => scenario === value);

const storedScenario = (): LiveMockScenario | null => {
  if (!import.meta.env.DEV) return null;
  const value = localStorage.getItem(LIVE_MOCK_STORAGE_KEY);
  return isScenario(value) ? value : null;
};

/**
 * The Live tab's fixture in development builds, so each state can be checked
 * without a running match. Always `null` in production.
 */
export const useLiveMock = (heroIdOf: (name: string) => number | undefined) => {
  const [scenario, setScenarioState] = useState(storedScenario);
  const mock = useMemo(
    () => (scenario ? buildLiveMock(scenario, heroIdOf) : null),
    [scenario, heroIdOf],
  );

  const setScenario = (next: LiveMockScenario | null) => {
    if (next) localStorage.setItem(LIVE_MOCK_STORAGE_KEY, next);
    else localStorage.removeItem(LIVE_MOCK_STORAGE_KEY);
    setScenarioState(next);
  };

  return { mock, scenario, setScenario };
};
