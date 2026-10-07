import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  PlugsIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Phase = "broken" | "reapplying" | "done";

/** How long each step of the loop stays on screen, in ms. */
const PHASES: { phase: Phase; duration: number }[] = [
  { phase: "broken", duration: 2800 },
  { phase: "reapplying", duration: 1300 },
  { phase: "done", duration: 3200 },
];

const LIBRARY = ["623518", "636266", "655209", "656796", "661996", "669234"];

/**
 * Plays the desktop app's gameinfo.gi bar on a loop while it's on screen:
 * the warning, the "Re-applying" state, then the bar closing and the toast
 * the app shows. Visitors who prefer reduced motion see the warning only.
 */
export const UpdateDemo = () => {
  const { t } = useTranslation("v2");
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const { phase } = PHASES[step] ?? PHASES[0];

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRunning(entry?.isIntersecting ?? false),
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => setStep((current) => (current + 1) % PHASES.length),
      PHASES[step]?.duration,
    );
    return () => window.clearTimeout(timer);
  }, [running, step]);

  return (
    <div
      ref={ref}
      aria-hidden='true'
      className='relative overflow-hidden rounded-xl border border-border-strong bg-background shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <div className='flex h-8 items-center gap-1.5 border-border border-b bg-surface px-3'>
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='ml-2 text-[11px] text-muted-foreground'>
          Deadlock Mod Manager
        </span>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          phase === "done" ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}>
        <div className='overflow-hidden'>
          <div className='flex items-center gap-3 border-primary/15 border-b bg-secondary py-1.5 pr-1.5 pl-3'>
            <PlugsIcon weight='fill' className='size-4 shrink-0 text-primary' />
            <p className='min-w-0 flex-1 text-[12px] leading-snug'>
              <span className='font-semibold text-foreground'>
                {t("demo.update.title")}
              </span>{" "}
              <span className='text-foreground/60'>
                {t("demo.update.body")}
              </span>
            </p>
            <span
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 font-semibold text-[11px] text-primary-foreground transition-transform duration-150",
                phase === "reapplying" && "translate-y-px opacity-90",
              )}>
              {phase === "reapplying" ? (
                <CircleNotchIcon className='size-3.5 animate-spin' />
              ) : (
                <ArrowsClockwiseIcon weight='bold' className='size-3.5' />
              )}
              {phase === "reapplying"
                ? t("demo.update.reapplying")
                : t("demo.update.reapply")}
            </span>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-3 gap-2 p-3'>
        {LIBRARY.map((id) => (
          <img
            key={id}
            src={`/home/mods/${id}.webp`}
            alt=''
            width={160}
            height={120}
            loading='lazy'
            className={cn(
              "aspect-[4/3] w-full rounded-md object-cover transition-[filter,opacity] duration-700",
              phase === "done" ? "opacity-100" : "opacity-45 grayscale",
            )}
          />
        ))}
      </div>

      <div
        className={cn(
          "absolute right-3 bottom-3 left-3 flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-[12px] shadow-lg transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:left-auto sm:max-w-[80%]",
          phase === "done"
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0",
        )}>
        <CheckCircleIcon
          weight='fill'
          className='size-4 shrink-0 text-online'
        />
        {t("demo.update.reapplied")}
      </div>
    </div>
  );
};
