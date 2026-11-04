import { Fragment, useMemo, useState } from "react";
import type { LiveMockSwitchProps } from "@/components/stats/live-scoreboard";
import type { LiveSource } from "@/hooks/use-live-source";
import {
  buildLiveMock,
  LIVE_MOCK_SCENARIOS,
  LIVE_MOCK_STORAGE_KEY,
  type LiveMock,
  type LiveMockScenario,
} from "@/lib/stats/live-mock";
import { cn } from "@/lib/utils";

const isScenario = (value: string | null): value is LiveMockScenario =>
  LIVE_MOCK_SCENARIOS.some((scenario) => scenario === value);

const storedScenario = (): LiveMockScenario | null => {
  const value = localStorage.getItem(LIVE_MOCK_STORAGE_KEY);
  return isScenario(value) ? value : null;
};

// The fixture's board always counts as just reported, so it never goes stale.
const toSource = (mock: LiveMock): LiveSource => ({
  status: {
    ...mock.status,
    scoreboard: mock.status.scoreboard && {
      ...mock.status.scoreboard,
      reportedAt: Date.now() - 2000,
    },
  },
  gameRunning: mock.gameRunning,
  bridge: {
    needsSetup: mock.bridgeNeedsSetup,
    inLibrary: false,
    isInstalling: false,
    install: () => {},
  },
  lobby: mock.lobby,
  curve: mock.curve,
  benchmarkPending: false,
  benchmarkFailed: false,
  trail: mock.trail,
  matches: mock.matches,
  finalGrades: mock.finalGrades,
  yourAccountId: mock.yourAccountId,
  badge: mock.yourBadge,
  result: mock.result,
  rememberGrade: null,
});

const MockPicker = ({
  scenario,
  onChange,
}: {
  scenario: LiveMockScenario | null;
  onChange: (scenario: LiveMockScenario | null) => void;
}) => (
  <div className='fixed right-4 bottom-12 z-50 flex flex-wrap items-center gap-1 rounded-lg border border-dashed bg-background/95 p-1 font-mono text-[11px] shadow-lg'>
    <span className='px-1.5 text-muted-foreground'>mock</span>
    {[null, ...LIVE_MOCK_SCENARIOS].map((option) => (
      <button
        className={cn(
          "rounded px-2 py-0.5 text-muted-foreground",
          option === scenario && "bg-secondary text-foreground",
        )}
        key={option ?? "off"}
        onClick={() => onChange(option)}
        type='button'>
        {option ?? "off"}
      </button>
    ))}
  </div>
);

/**
 * Development builds only, and only ever loaded through a dynamic import, so
 * the fixtures stay out of production bundles. Switches the Live tab between
 * the running game and a fixture for each state, remembered in localStorage.
 */
export const LiveMockSwitch = ({
  heroIdOf,
  live,
  renderView,
}: LiveMockSwitchProps) => {
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

  return (
    <>
      <MockPicker onChange={setScenario} scenario={scenario} />
      {/* A new fixture remounts the view, so no state leaks between them. */}
      {mock ? (
        <Fragment key={scenario}>{renderView(toSource(mock))}</Fragment>
      ) : (
        live
      )}
    </>
  );
};
