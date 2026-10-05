import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckCircleIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "@/components/logo";
import { usePreviewState } from "./preview-state";
import { type ScreenId, usePreviewNavigation } from "./store";
import { getPreviewTheme } from "./themes";

export type LaunchMode = "modded" | "vanilla";

export type LaunchState =
  | { phase: "idle" }
  | {
      phase: "launching";
      mode: LaunchMode;
      modCount: number;
      /** Number of checklist steps already ticked. */
      done: number;
      leaving: boolean;
    }
  | { phase: "running"; mode: LaunchMode };

const STEP_MS = 450;
const STEP_COUNT = 3;
const LEAVE_AT = STEP_MS * STEP_COUNT + 150;
const FINISH_AT = LEAVE_AT + 200;

/** Fake launch: ticks a short checklist, then the game counts as running. */
export const useLaunchSequence = (screen: ScreenId) => {
  const { notify, installs } = usePreviewState();
  const [state, setState] = useState<LaunchState>({ phase: "idle" });
  const timeouts = useRef<number[]>([]);
  const enabledCount = Object.values(installs).filter(
    (install) => install.status === "installed" && install.enabled,
  ).length;

  const clearTimeouts = useCallback(() => {
    for (const timeout of timeouts.current) window.clearTimeout(timeout);
    timeouts.current = [];
  }, []);

  useEffect(() => clearTimeouts, [clearTimeouts]);

  // Navigating away cancels a launch that is still in progress.
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (lastScreen.current === screen) return;
    lastScreen.current = screen;
    clearTimeouts();
    setState((current) =>
      current.phase === "launching" ? { phase: "idle" } : current,
    );
  }, [screen, clearTimeouts]);

  const launch = (mode: LaunchMode) => {
    if (state.phase !== "idle") return;
    clearTimeouts();
    const modCount = mode === "modded" ? enabledCount : 0;
    const at = (ms: number, run: () => void) => {
      timeouts.current.push(window.setTimeout(run, ms));
    };
    const update = (next: { done?: number; leaving?: boolean }) =>
      setState((current) =>
        current.phase === "launching" ? { ...current, ...next } : current,
      );

    setState({ phase: "launching", mode, modCount, done: 0, leaving: false });
    for (let step = 1; step <= STEP_COUNT; step++) {
      at(STEP_MS * step, () => update({ done: step }));
    }
    at(LEAVE_AT, () => update({ leaving: true }));
    at(FINISH_AT, () => {
      timeouts.current = [];
      setState({ phase: "running", mode });
      notify(
        "Deadlock is running",
        modCount > 0
          ? "Have fun out there. Your mods are live."
          : "Have fun out there. Playing vanilla this time.",
      );
    });
  };

  const stop = () => {
    if (state.phase !== "running") return;
    clearTimeouts();
    setState({ phase: "idle" });
    notify("Deadlock closed", "Back to the manager.");
  };

  return { state, enabledCount, launch, stop };
};

const stepLabels = (state: Extract<LaunchState, { phase: "launching" }>) => [
  "Checking game files",
  state.mode === "vanilla"
    ? "Skipping mods"
    : state.modCount > 0
      ? `Applying ${state.modCount} ${state.modCount === 1 ? "mod" : "mods"}`
      : "No mods enabled, starting vanilla",
  "Starting Deadlock",
];

/** Covers the sidebar and content while a launch is in progress. */
export const LaunchOverlay = ({ state }: { state: LaunchState }) => {
  const { theme } = usePreviewNavigation();
  if (state.phase !== "launching") return null;
  const { icon } = getPreviewTheme(theme);

  return (
    <div
      role='status'
      aria-live='polite'
      className={cn(
        "absolute inset-0 z-10 flex animate-dl-fade-in items-center justify-center bg-background/70 backdrop-blur-[2px] transition-opacity duration-200 motion-reduce:transition-none",
        state.leaving && "opacity-0",
      )}>
      <div className='flex w-80 animate-dl-pop-in flex-col items-center rounded-xl border bg-card p-6 text-card-foreground shadow-[0_24px_60px_rgba(0,0,0,0.45)]'>
        {icon ? (
          <img
            src={icon}
            alt=''
            className='size-14 animate-dl-launch-spin object-contain'
          />
        ) : (
          <Logo className='size-14 animate-dl-launch-spin' />
        )}
        <div className='mt-4 font-primary text-xl tracking-wide'>
          Launching Deadlock
        </div>
        <ol className='mt-5 flex w-full flex-col gap-2.5'>
          {stepLabels(state).map((label, index) => {
            const done = index < state.done;
            const active = index === state.done;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 text-sm transition-colors duration-200",
                  done || active ? "text-foreground" : "text-muted-foreground",
                )}>
                <span className='flex size-4 shrink-0 items-center justify-center'>
                  {done ? (
                    <CheckCircleIcon
                      weight='fill'
                      className='size-4 animate-dl-check-in text-primary'
                    />
                  ) : active ? (
                    <CircleNotchIcon
                      weight='bold'
                      className='size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none'
                    />
                  ) : (
                    <span className='size-1.5 rounded-full bg-muted-foreground/50' />
                  )}
                </span>
                <span>{label}</span>
                <span className='sr-only'>
                  {done ? "done" : active ? "in progress" : "pending"}
                </span>
              </li>
            );
          })}
        </ol>
        <div className='mt-5 h-0.5 w-full overflow-hidden rounded-full bg-muted'>
          <div
            className='h-full origin-left bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none'
            style={{ transform: `scaleX(${state.done / STEP_COUNT})` }}
          />
        </div>
      </div>
    </div>
  );
};
