import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  BugBeetleIcon,
  CheckIcon,
  CircleNotchIcon,
  ClockCounterClockwiseIcon,
  PlayIcon,
  QuestionIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useBisect } from "@/hooks/use-bisect";
import { useLaunch } from "@/hooks/use-launch";
import { useBisectDialog } from "@/lib/bisect/dialogs";
import { suspectCount } from "@/lib/bisect/search";
import { usePersistedStore } from "@/lib/store";
import type { BisectSession } from "@/lib/store/slices/bisect";
import { cn } from "@/lib/utils";

const ACTION_CLASS = "h-7 px-2.5 text-xs";

/** Mounted only while a round is ready: useLaunch subscribes to the store. */
const LaunchButton = () => {
  const { t } = useTranslation();
  const { launch } = useLaunch();
  const launchGame = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: () => launch(false),
  });
  return (
    <Button
      className={cn(ACTION_CLASS, "font-semibold")}
      disabled={launchGame.isPending}
      onClick={() => launchGame.mutate()}
      size='sm'>
      {launchGame.isPending ? (
        <CircleNotchIcon className='size-3.5 animate-spin' />
      ) : (
        <PlayIcon className='size-3.5' weight='fill' />
      )}
      {t("bisect.banner.launch")}
    </Button>
  );
};

/** 0 when every candidate is a suspect, 1 when one is left. */
const progressOf = (session: BisectSession) => {
  const total = session.candidates.length;
  if (session.culprits) return 1;
  if (total <= 1) return 0;
  const left = Math.max(suspectCount(session.algo), 1);
  return 1 - Math.log2(left) / Math.log2(total);
};

type BannerProps = {
  session: BisectSession;
  onShowResult: () => void;
};

export const BisectBanner = ({ session, onShowResult }: BannerProps) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { run, isPending } = useBisect();
  const updateSession = usePersistedStore((state) => state.updateBisectSession);
  const activeProfileId = usePersistedStore((state) => state.activeProfileId);
  const sessionProfileName = usePersistedStore(
    (state) => state.profiles[session.profileId]?.name,
  );
  const switchToProfile = usePersistedStore((state) => state.switchToProfile);
  const showExplainer = useBisectDialog((state) => state.showExplainer);

  const switchBack = useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: () => switchToProfile(session.profileId),
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        toast.error(t("bisect.toasts.switchBackFailed"));
      }
    },
    onError: () => toast.error(t("bisect.toasts.switchBackFailed")),
  });

  const total = session.candidates.length;
  const canUndo =
    session.history.length > 0 &&
    !isPending &&
    (session.stage === "ready" ||
      session.stage === "judging" ||
      session.stage === "result");

  const stop = async () => {
    const confirmed = await confirm({
      title: t("bisect.stop.title"),
      body: t("bisect.stop.body", { count: total }),
      actionButton: t("bisect.stop.confirm"),
      actionButtonIcon: ArrowCounterClockwiseIcon,
      actionButtonVariant: "default",
      cancelButton: t("bisect.stop.cancel"),
      icon: ClockCounterClockwiseIcon,
    });
    if (confirmed) run({ type: "stop" });
  };

  const discard = async () => {
    const confirmed = await confirm({
      title: t("bisect.discard.title"),
      body: t("bisect.discard.body", { profile: sessionProfileName ?? "" }),
      actionButton: t("bisect.discard.confirm"),
      cancelButton: t("bisect.discard.cancel"),
      tone: "destructive",
    });
    if (confirmed) run({ type: "discard" });
  };

  const wrongProfile = session.profileId !== activeProfileId;

  let message: string;
  let actions: ReactNode = null;
  let busy = false;

  if (wrongProfile) {
    message = t("bisect.banner.wrongProfile", {
      profile: sessionProfileName ?? "",
    });
    actions = (
      <>
        <Button
          className={ACTION_CLASS}
          disabled={switchBack.isPending || !sessionProfileName}
          onClick={() => switchBack.mutate()}
          size='sm'>
          {t("bisect.banner.switchBack")}
        </Button>
        <Button
          className={ACTION_CLASS}
          onClick={discard}
          size='sm'
          variant='ghost'>
          {t("bisect.banner.discard")}
        </Button>
      </>
    );
  } else {
    switch (session.stage) {
      case "applying":
        busy = isPending;
        message = isPending
          ? t("bisect.banner.applying", { round: session.round })
          : t("bisect.banner.applyInterrupted", { round: session.round });
        if (!isPending) {
          actions = (
            <Button
              className={ACTION_CLASS}
              onClick={() => run({ type: "retry" })}
              size='sm'>
              <ArrowsClockwiseIcon className='size-3.5' weight='bold' />
              {t("bisect.banner.continue")}
            </Button>
          );
        }
        break;
      case "ready":
        message =
          session.config.length === 0
            ? t("bisect.banner.readyBaseline", { count: total })
            : t("bisect.banner.ready", {
                on: session.config.length,
                count: total,
              });
        actions = <LaunchButton />;
        break;
      case "playing":
        message = t("bisect.banner.playing");
        actions = (
          <Button
            className={ACTION_CLASS}
            onClick={() => updateSession({ stage: "judging" })}
            size='sm'
            variant='ghost'>
            {t("bisect.banner.answerNow")}
          </Button>
        );
        break;
      case "judging":
        busy = isPending;
        message = session.crashDetected
          ? t("bisect.banner.crashed")
          : session.config.length === 0
            ? t("bisect.banner.questionBaseline")
            : t("bisect.banner.question");
        // A failed automatic answer leaves the buttons as the way out.
        if (!busy) {
          actions = (
            <>
              <Button
                className={cn(
                  ACTION_CLASS,
                  "bg-destructive/15 text-foreground hover:bg-destructive/25",
                )}
                onClick={() => run({ type: "answer", outcome: "fail" })}
                size='sm'
                variant='ghost'>
                <XIcon className='size-3.5' weight='bold' />
                {t("bisect.answers.broken")}
              </Button>
              <Button
                className={cn(
                  ACTION_CLASS,
                  "bg-status-ok/15 text-foreground hover:bg-status-ok/25",
                )}
                onClick={() => run({ type: "answer", outcome: "pass" })}
                size='sm'
                variant='ghost'>
                <CheckIcon className='size-3.5' weight='bold' />
                {t("bisect.answers.fine")}
              </Button>
              <Button
                className={ACTION_CLASS}
                onClick={() =>
                  run({
                    type: "answer",
                    outcome: "unresolved",
                  })
                }
                size='sm'
                title={t("bisect.answers.unsureHint")}
                variant='ghost'>
                {t("bisect.answers.unsure")}
              </Button>
            </>
          );
        }
        break;
      case "result":
        message = t("bisect.banner.result");
        actions = (
          <Button className={ACTION_CLASS} onClick={onShowResult} size='sm'>
            {t("bisect.banner.seeResult")}
          </Button>
        );
        break;
      case "restoring":
        busy = isPending;
        message = isPending
          ? t("bisect.banner.restoring")
          : t("bisect.banner.restoreInterrupted");
        if (!isPending) {
          actions = (
            <Button
              className={ACTION_CLASS}
              onClick={() => run({ type: "retry" })}
              size='sm'>
              <ArrowsClockwiseIcon className='size-3.5' weight='bold' />
              {t("bisect.banner.finishRestoring")}
            </Button>
          );
        }
        break;
    }
  }

  const canStop = !wrongProfile && !isPending && session.stage !== "restoring";

  return (
    <div
      className='relative z-20 flex h-11 shrink-0 items-center gap-4 border-primary/15 border-b bg-secondary pr-2 pl-3 motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:animate-in motion-safe:duration-500 motion-safe:ease-[var(--ease-dmm-smooth)]'
      role='status'>
      <div className='flex shrink-0 items-center gap-2.5'>
        <span className='flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary'>
          {busy ? (
            <CircleNotchIcon aria-hidden className='size-4 animate-spin' />
          ) : (
            <BugBeetleIcon aria-hidden className='size-4' weight='fill' />
          )}
        </span>
        <span className='font-semibold text-[13px] text-foreground'>
          {t("bisect.banner.title")}
        </span>
        {!session.culprits && (
          <span className='inline-flex h-5 items-center rounded-full border border-primary/25 bg-primary/10 px-2 font-medium text-[11px] text-primary tabular-nums'>
            {t("bisect.banner.round", { round: session.round })}
          </span>
        )}
      </div>

      <span aria-hidden className='h-5 w-px shrink-0 bg-foreground/10' />

      <p
        className='min-w-0 flex-1 truncate text-[13px] text-foreground/70'
        title={message}>
        {message}
      </p>

      <div className='flex shrink-0 items-center gap-2'>
        {actions && <div className='flex items-center gap-1.5'>{actions}</div>}
        {actions && <span aria-hidden className='h-5 w-px bg-foreground/10' />}
        <div className='flex items-center gap-0.5'>
          {canUndo && (
            <Button
              aria-label={t("bisect.banner.undo")}
              className='size-7 text-foreground/60 hover:bg-primary/10 hover:text-foreground'
              onClick={() => run({ type: "undo" })}
              size='icon'
              title={t("bisect.banner.undo")}
              variant='ghost'>
              <ArrowCounterClockwiseIcon className='size-3.5' weight='bold' />
            </Button>
          )}
          <Button
            aria-label={t("bisect.banner.howItWorks")}
            className='size-7 text-foreground/60 hover:bg-primary/10 hover:text-foreground'
            onClick={() => showExplainer(null)}
            size='icon'
            title={t("bisect.banner.howItWorks")}
            variant='ghost'>
            <QuestionIcon className='size-3.5' weight='bold' />
          </Button>
          {canStop && (
            <Button
              className={cn(
                ACTION_CLASS,
                "gap-1.5 text-foreground/60 hover:bg-primary/10 hover:text-foreground",
              )}
              onClick={stop}
              size='sm'
              variant='ghost'>
              <XIcon className='size-3.5' weight='bold' />
              {t("bisect.banner.stop")}
            </Button>
          )}
        </div>
      </div>

      <div
        aria-hidden
        className='absolute inset-x-0 bottom-0 h-0.5 bg-primary/10'>
        <div
          className='h-full bg-primary transition-[width] duration-700 ease-[var(--ease-dmm-smooth)]'
          style={{ width: `${Math.round(progressOf(session) * 100)}%` }}
        />
      </div>
    </div>
  );
};
