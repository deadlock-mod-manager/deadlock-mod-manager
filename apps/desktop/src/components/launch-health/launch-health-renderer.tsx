import { toast } from "@deadlock-mods/ui/components/sonner";
import { LightningSlashIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCrashCheck } from "@/hooks/use-crash-check";
import { CrashCheckDialog } from "./crash-check-dialog";
import { formatUptime, summarizeChange } from "./format";

const TOAST_DURATION_MS = 20_000;

const toastIdFor = (sessionId: string) => `crash-check-${sessionId}`;

/**
 * The crash check, mounted once in app.tsx. Strong evidence opens the dialog
 * directly; weaker or older evidence shows a toast that opens it on Review.
 * Neither appears while Deadlock is running.
 */
export const LaunchHealthRenderer = () => {
  const { t } = useTranslation();
  const crashCheck = useCrashCheck();
  const { prompt, dismiss, openDialog } = crashCheck;
  const toastShownFor = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = prompt?.report.sessionId ?? null;
    if (toastShownFor.current && toastShownFor.current !== sessionId) {
      toast.dismiss(toastIdFor(toastShownFor.current));
      toastShownFor.current = null;
    }
    if (
      !prompt ||
      prompt.decision.presentation !== "toast" ||
      toastShownFor.current === prompt.report.sessionId
    ) {
      return;
    }
    toastShownFor.current = prompt.report.sessionId;
    toast(
      t("launchHealth.toast.title", {
        duration: formatUptime(t, prompt.report.uptimeSecs ?? 0),
      }),
      {
        id: toastIdFor(prompt.report.sessionId),
        icon: (
          <LightningSlashIcon
            className='size-4 text-destructive'
            weight='duotone'
          />
        ),
        description: summarizeChange(t, prompt.decision.changes[0]),
        duration: TOAST_DURATION_MS,
        action: { label: t("launchHealth.toast.review"), onClick: openDialog },
        onDismiss: dismiss,
        onAutoClose: dismiss,
      },
    );
  }, [prompt, dismiss, openDialog, t]);

  if (!prompt) return null;
  return <CrashCheckDialog crashCheck={crashCheck} prompt={prompt} />;
};
