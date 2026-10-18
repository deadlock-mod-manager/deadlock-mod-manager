import { Button } from "@deadlock-mods/ui/components/button";
import { X } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckCircleIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLaunchProgress } from "@/lib/launch-progress";
import Logo from "./logo";

/** Covers the sidebar and content while a launch is being prepared. */
export const LaunchOverlay = () => {
  const { t } = useTranslation();
  const progress = useLaunchProgress((state) => state.progress);
  const hide = useLaunchProgress((state) => state.hide);
  const visible = !!progress && !progress.hidden;

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, hide]);

  if (!progress || progress.hidden) return null;

  const { steps, current } = progress;
  const currentIndex = current === null ? steps.length : steps.indexOf(current);

  return (
    <div
      role='status'
      aria-live='polite'
      className='absolute inset-0 z-30 flex animate-launch-fade-in items-center justify-center bg-background/70 backdrop-blur-[2px]'>
      <div className='relative flex w-80 animate-launch-pop-in flex-col items-center rounded-xl border bg-card p-6 text-card-foreground shadow-[0_24px_60px_rgba(0,0,0,0.45)]'>
        <Button
          aria-label={t("launch.hide")}
          className='absolute top-2 right-2 size-7 text-muted-foreground'
          onClick={hide}
          size='icon'
          title={t("launch.hide")}
          variant='ghost'>
          <X className='size-4' />
        </Button>
        <Logo className='size-14 animate-launch-spin' />
        <div className='mt-4 font-primary text-xl tracking-wide'>
          {t("launch.title")}
        </div>
        <ol className='mt-5 flex w-full flex-col gap-2.5'>
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li
                key={step}
                className={cn(
                  "flex items-center gap-2.5 text-sm transition-colors duration-200",
                  done || active ? "text-foreground" : "text-muted-foreground",
                )}>
                <span className='flex size-4 shrink-0 items-center justify-center'>
                  {done ? (
                    <CheckCircleIcon
                      weight='fill'
                      className='size-4 animate-launch-check-in text-primary'
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
                <span>
                  {t(`launch.steps.${step}`, { count: progress.modCount })}
                </span>
                <span className='sr-only'>
                  {done
                    ? t("launch.stepState.done")
                    : active
                      ? t("launch.stepState.active")
                      : t("launch.stepState.pending")}
                </span>
              </li>
            );
          })}
        </ol>
        <div className='mt-5 h-0.5 w-full overflow-hidden rounded-full bg-muted'>
          <div
            className='h-full origin-left bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none'
            style={{ transform: `scaleX(${currentIndex / steps.length})` }}
          />
        </div>
      </div>
    </div>
  );
};
