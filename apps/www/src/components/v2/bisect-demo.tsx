import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  BugBeetleIcon,
  CheckIcon,
  CircleNotchIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PREVIEW_MODS } from "@/components/home/app-preview/mods";

const MODS = PREVIEW_MODS.slice(0, 8);
const LAUNCH_MS = 900;
/** Fixed for the first play so the server and client render the same. */
const FIRST_CULPRIT = 5;

type Stage = "ready" | "launching" | "judging" | "found";

/**
 * A short version of the desktop app's Find a broken mod: each round the
 * first half of the suspects is on, the game shows whether the hidden
 * culprit is among them, and the answer halves the list.
 */
export const BisectDemo = () => {
  const { t } = useTranslation("v2");
  const [culprit, setCulprit] = useState(FIRST_CULPRIT);
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(MODS.length);
  const [round, setRound] = useState(1);
  const [stage, setStage] = useState<Stage>("ready");
  const [restored, setRestored] = useState(false);

  const middle = Math.ceil((low + high) / 2);
  const isOn = (index: number) => index >= low && index < middle;
  const broken = culprit >= low && culprit < middle;

  useEffect(() => {
    if (stage !== "launching") return;
    const timer = window.setTimeout(() => setStage("judging"), LAUNCH_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const answer = (stillBroken: boolean) => {
    const nextLow = stillBroken ? low : middle;
    const nextHigh = stillBroken ? middle : high;
    setLow(nextLow);
    setHigh(nextHigh);
    if (nextHigh - nextLow === 1) {
      setStage("found");
      return;
    }
    setRound(round + 1);
    setStage("ready");
  };

  const restart = (restore: boolean) => {
    setRestored(restore);
    if (!restore) {
      setCulprit(Math.floor(Math.random() * MODS.length));
    }
    setLow(0);
    setHigh(MODS.length);
    setRound(1);
    setStage("ready");
  };

  const found = stage === "found" ? MODS[low] : null;

  return (
    <div className='rounded-xl border border-border-strong bg-surface p-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1'>
        <span className='flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary'>
          <BugBeetleIcon weight='fill' className='size-4' />
        </span>
        <p className='whitespace-nowrap font-semibold text-sm'>
          {t("demo.bisect.title")}
        </p>
        {!found && (
          <span className='inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border border-primary/25 bg-primary/10 px-2 font-medium text-[11px] text-primary tabular-nums'>
            {t("demo.bisect.round", { round })}
          </span>
        )}
        <span className='ml-auto whitespace-nowrap text-muted-foreground text-xs tabular-nums'>
          {found
            ? t("demo.bisect.foundIn", { count: round })
            : t("demo.bisect.left", { count: high - low })}
        </span>
      </div>

      <ul className='mt-4 grid grid-cols-4 gap-2 sm:grid-cols-8'>
        {MODS.map((mod, index) => {
          const suspect = index >= low && index < high;
          const isCulprit = found?.id === mod.id;
          const on = found ? !isCulprit : isOn(index);
          return (
            <li
              key={mod.id}
              title={mod.name}
              className={cn(
                "relative overflow-hidden rounded-md border border-border bg-background/40 transition-all duration-500 motion-reduce:transition-none",
                !found && !suspect && "scale-90 opacity-30",
                isCulprit &&
                  "border-destructive shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-destructive)_60%,transparent)]",
              )}>
              <img
                src={`/home/mods/${mod.id}.webp`}
                alt=''
                width={64}
                height={64}
                loading='lazy'
                className={cn(
                  "aspect-square w-full object-cover transition-[filter,opacity] duration-500",
                  !on && "opacity-40 grayscale",
                )}
              />
              <span className='flex justify-center py-1.5'>
                <span
                  className={cn(
                    "relative h-2.5 w-5 rounded-full transition-colors duration-500",
                    on ? "bg-primary" : "bg-border-strong",
                  )}>
                  <span
                    className={cn(
                      "absolute top-0.5 size-1.5 rounded-full bg-background transition-transform duration-500",
                      on ? "translate-x-3" : "translate-x-0.5",
                    )}
                  />
                </span>
              </span>
              {!found && !suspect && (
                <CheckIcon
                  weight='bold'
                  className='absolute inset-x-0 top-[30%] mx-auto size-5 text-online'
                />
              )}
              {isCulprit && (
                <MagnifyingGlassIcon
                  weight='bold'
                  className='absolute top-1 right-1 size-4 rounded-sm bg-destructive p-0.5 text-white'
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className='mt-4 flex flex-col gap-3 border-border border-t pt-4 sm:flex-row sm:items-center'>
        {found ? (
          <div className='min-w-0 flex-1 animate-dl-rise px-1'>
            <p className='truncate font-semibold text-sm'>
              {t("demo.bisect.found", { name: found.name })}
            </p>
            <p className='text-muted-foreground text-xs'>
              {found.id === MODS[culprit].id
                ? t("demo.bisect.foundBody")
                : t("demo.bisect.wrongAnswer")}
            </p>
          </div>
        ) : (
          <div
            aria-hidden='true'
            className={cn(
              "relative flex h-16 flex-1 items-center justify-center overflow-hidden rounded-md border bg-background transition-colors duration-500",
              stage === "judging" && broken && "border-destructive/60",
              stage === "judging" && !broken && "border-online/60",
              stage !== "judging" && "border-border",
            )}>
            {stage === "ready" && (
              <PlayIcon weight='fill' className='size-6 text-border-strong' />
            )}
            {stage === "launching" && (
              <CircleNotchIcon className='size-6 animate-spin text-primary' />
            )}
            {stage === "judging" &&
              (broken ? (
                <span className='flex w-full flex-col gap-1.5 px-4 motion-safe:animate-pulse'>
                  <span className='h-1.5 w-3/4 rounded bg-destructive/70' />
                  <span className='ml-6 h-1.5 w-1/2 rounded bg-destructive/50' />
                  <span className='h-1.5 w-2/3 rounded bg-destructive/70' />
                </span>
              ) : (
                <CheckIcon
                  weight='bold'
                  className='size-7 animate-dl-rise text-online'
                />
              ))}
          </div>
        )}

        <div className='flex shrink-0 flex-wrap gap-2'>
          {stage === "ready" && (
            <button
              type='button'
              onClick={() => setStage("launching")}
              className='inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground text-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
              <PlayIcon weight='fill' className='size-3.5' />
              {t("demo.bisect.launch")}
            </button>
          )}
          {stage === "launching" && (
            <span className='inline-flex h-8 items-center px-3 text-muted-foreground text-xs'>
              {t("demo.bisect.launching")}
            </span>
          )}
          {stage === "judging" && (
            <>
              <button
                type='button'
                onClick={() => answer(true)}
                className='inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 font-medium text-xs hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                <XIcon weight='bold' className='size-3.5' />
                {t("demo.bisect.broken")}
              </button>
              <button
                type='button'
                onClick={() => answer(false)}
                className='inline-flex h-8 items-center gap-1.5 rounded-md border border-online/40 bg-online/10 px-3 font-medium text-xs hover:bg-online/20 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                <CheckIcon weight='bold' className='size-3.5' />
                {t("demo.bisect.fine")}
              </button>
            </>
          )}
          {found && (
            <>
              <button
                type='button'
                onClick={() => restart(true)}
                className='h-8 rounded-md border border-border-hover px-3 font-medium text-xs hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                {t("demo.bisect.restore")}
              </button>
              <button
                type='button'
                onClick={() => restart(false)}
                className='inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 font-semibold text-primary-foreground text-xs hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px'>
                <ArrowCounterClockwiseIcon weight='bold' className='size-3.5' />
                {t("demo.bisect.again")}
              </button>
            </>
          )}
        </div>
      </div>

      <p role='status' className='mt-3 px-1 text-xs'>
        {stage === "judging" ? (
          <span className='text-foreground'>{t("demo.bisect.question")}</span>
        ) : restored && round === 1 && stage === "ready" ? (
          <span className='flex animate-dl-rise items-center gap-1.5 text-foreground'>
            <CheckIcon weight='bold' className='size-3.5 text-online' />
            {t("demo.bisect.restored")}
          </span>
        ) : (
          <span className='text-muted-foreground'>
            {found ? t("demo.bisect.foundHint") : t("demo.bisect.hint")}
          </span>
        )}
      </p>
    </div>
  );
};
