import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type Phase = "broken" | "fixing" | "fixed";

/** Three skins the check can fix, and three that already match the game. */
const LIBRARY = [
  { id: "661996", name: "Formal Wraith", fixable: true },
  { id: "655209", name: "Faun Celeste (QUALITY UPDATE)", fixable: false },
  { id: "636266", name: "Jacket (Billy Overhaul)", fixable: true },
  { id: "691863", name: "Yamato remodel", fixable: false },
  { id: "656006", name: "Holliday Remodel", fixable: true },
  { id: "628313", name: "Toon Ivy (SOUL ORB FIX)", fixable: false },
];

const FIXABLE_COUNT = LIBRARY.filter((mod) => mod.fixable).length;

const FIXING_MS = 1400;

const HealthBadge = ({ fixed }: { fixed: boolean }) => {
  const { t } = useTranslation("v2");
  const Icon = fixed ? CheckIcon : WrenchIcon;

  // The tooltip is positioned against the card, so it never spills past the
  // demo's clipped edge.
  return (
    <>
      <span
        tabIndex={0}
        className={cn(
          "peer absolute bottom-1.5 left-1.5 inline-flex cursor-help items-center gap-1 rounded-md border bg-background/80 px-1.5 py-0.5 font-medium text-[10px] backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-primary",
          fixed
            ? "border-border text-muted-foreground"
            : "border-primary/50 text-primary",
        )}>
        <Icon weight='bold' aria-hidden='true' className='size-3' />
        {fixed ? t("demo.health.fixed") : t("demo.health.fixable")}
      </span>
      <span
        role='tooltip'
        className='pointer-events-none absolute inset-x-1.5 bottom-9 z-10 rounded-md border border-border-strong bg-surface p-2 text-[11px] text-foreground leading-snug opacity-0 shadow-lg transition-opacity duration-150 peer-hover:opacity-100 peer-focus-visible:opacity-100'>
        {fixed
          ? t("demo.health.fixedSummary")
          : t("demo.health.fixableSummary")}
        <ul className='mt-1 list-disc pl-4 text-muted-foreground'>
          <li>{t("demo.health.symptomCamera")}</li>
          <li>{t("demo.health.symptomAnimations")}</li>
        </ul>
      </span>
    </>
  );
};

/**
 * The Mods Library after a game update: the mod health banner, its badges and
 * Fix N mods, which works the way it does in the app.
 */
export const ModHealthDemo = () => {
  const { t } = useTranslation("v2");
  const [phase, setPhase] = useState<Phase>("broken");

  useEffect(() => {
    if (phase !== "fixing") return;
    const timer = window.setTimeout(() => setPhase("fixed"), FIXING_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div className='relative overflow-hidden rounded-xl border border-border-strong bg-background shadow-[0_30px_80px_rgba(0,0,0,0.35)]'>
      <div className='flex h-8 items-center gap-1.5 border-border border-b bg-surface px-3'>
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='size-2 rounded-full bg-border-hover' />
        <span className='ml-2 text-[11px] text-muted-foreground'>
          {t("demo.health.window")}
        </span>
      </div>

      <div className='p-3'>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            phase === "fixed"
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100",
          )}>
          <div className='overflow-hidden'>
            <div className='mb-3 flex flex-col gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center'>
              <div className='flex min-w-0 flex-1 items-start gap-2.5'>
                <span className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-primary ring-1 ring-border'>
                  <WrenchIcon weight='bold' className='size-3.5' />
                </span>
                <p className='text-pretty font-medium text-[12px] leading-5'>
                  {t("demo.health.banner", { count: FIXABLE_COUNT })}
                </p>
              </div>
              <div className='flex shrink-0 items-center gap-2 pl-9 sm:pl-0'>
                <button
                  type='button'
                  disabled={phase !== "broken"}
                  onClick={() => setPhase("fixing")}
                  className='inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-semibold text-[11px] text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-90'>
                  {phase === "fixing" ? (
                    <CircleNotchIcon className='size-3.5 animate-spin' />
                  ) : (
                    <WrenchIcon weight='bold' className='size-3.5' />
                  )}
                  {t("demo.health.fix", { count: FIXABLE_COUNT })}
                </button>
                <span
                  aria-hidden='true'
                  className='inline-flex h-7 items-center rounded-md border border-border-hover px-2.5 font-medium text-[11px]'>
                  {t("demo.health.seeDetails")}
                </span>
              </div>
            </div>
          </div>
        </div>

        <ul className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          {LIBRARY.map((mod) => {
            const broken = mod.fixable && phase !== "fixed";
            return (
              <li key={mod.id}>
                <div className='relative'>
                  <img
                    src={`/home/mods/${mod.id}.webp`}
                    alt=''
                    width={160}
                    height={120}
                    loading='lazy'
                    className={cn(
                      "aspect-[4/3] w-full rounded-md object-cover transition-[filter,opacity] duration-700",
                      broken && "opacity-60 saturate-[0.35]",
                    )}
                  />
                  {mod.fixable && <HealthBadge fixed={phase === "fixed"} />}
                </div>
                <p className='mt-1 truncate text-[11px] text-foreground-soft'>
                  {mod.name}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        role='status'
        className={cn(
          "absolute right-3 bottom-3 left-3 flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[12px] shadow-lg transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none sm:left-auto",
          phase === "fixed"
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0",
        )}>
        {phase === "fixed" && (
          <>
            <CheckCircleIcon
              weight='fill'
              className='size-4 shrink-0 text-online'
            />
            <span className='flex-1'>
              {t("demo.health.fixedToast", { count: FIXABLE_COUNT })}
            </span>
            <button
              type='button'
              onClick={() => setPhase("broken")}
              aria-label={t("demo.health.replay")}
              title={t("demo.health.replay")}
              className='-mr-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary'>
              <ArrowCounterClockwiseIcon weight='bold' className='size-3.5' />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
