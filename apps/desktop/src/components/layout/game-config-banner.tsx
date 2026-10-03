import { Button } from "@deadlock-mods/ui/components/button";
import {
  ArrowsClockwiseIcon,
  CircleNotchIcon,
  NewspaperIcon,
  PlugsIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { PatchNotesDialog } from "@/components/patch-notes/patch-notes-dialog";
import { useGameConfigAlert } from "@/hooks/use-game-config-alert";
import { usePatchNotes } from "@/hooks/use-patch-notes";
import { cn } from "@/lib/utils";

const COPY = {
  resetByUpdate: {
    title: "gameConfig.resetByUpdateTitle",
    body: "gameConfig.resetByUpdateBody",
  },
  detached: {
    title: "gameConfig.detachedTitle",
    body: "gameConfig.detachedBody",
  },
  updated: { title: "gameConfig.updatedTitle", body: "gameConfig.updatedBody" },
};

const FileName = ({ children }: { children?: React.ReactNode }) => (
  <span className='font-medium text-foreground/90'>{children}</span>
);

export const GameConfigBanner = () => {
  const { t } = useTranslation();
  const { alert, enabledModsCount, acknowledgeUpdate, reapply } =
    useGameConfigAlert();
  // Hidden until restart; the update side is acknowledged instead, so
  // dismissing one half never resurfaces the other.
  const [detachedDismissed, setDetachedDismissed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const broken = !!alert?.modsDetached && !detachedDismissed;
  const updated = !!alert?.gameUpdated;
  const { data: patchNotes } = usePatchNotes({ enabled: updated || notesOpen });
  const latestNote = patchNotes?.[0] ?? null;

  const dialog = (
    <PatchNotesDialog
      note={notesOpen ? latestNote : null}
      onClose={() => setNotesOpen(false)}
    />
  );

  if (!broken && !updated) return dialog;

  const copy = broken
    ? updated
      ? COPY.resetByUpdate
      : COPY.detached
    : COPY.updated;
  const Icon = broken ? PlugsIcon : NewspaperIcon;

  const dismiss = () => {
    acknowledgeUpdate();
    if (alert?.modsDetached) setDetachedDismissed(true);
  };

  return (
    <>
      <div
        role={broken ? "alert" : "status"}
        className={cn(
          // z-20 keeps the fixed backdrop geometry from painting over it,
          // the same layer the titlebar sits on.
          "relative z-20 flex shrink-0 items-center gap-3 border-b py-1.5 pr-1.5 pl-4",
          "motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:animate-in motion-safe:duration-500 motion-safe:ease-[var(--ease-dmm-smooth)]",
          broken ? "border-primary/15 bg-secondary" : "border-border bg-card",
        )}>
        <Icon
          aria-hidden='true'
          className={cn(
            "size-[18px] shrink-0",
            broken ? "text-primary" : "text-secondary-foreground",
          )}
          weight={broken ? "fill" : "regular"}
        />

        <p className='min-w-0 flex-1 truncate text-[13px] leading-7'>
          <span className='font-semibold text-foreground'>{t(copy.title)}</span>{" "}
          <span className='text-foreground/60'>
            <Trans
              components={{ file: <FileName /> }}
              count={enabledModsCount}
              i18nKey={copy.body}
              values={{ count: enabledModsCount }}
            />
          </span>
        </p>

        <div className='flex shrink-0 items-center gap-1'>
          {updated && latestNote && (
            <Button
              className='h-7 px-2.5 text-foreground/80 text-xs hover:bg-primary/10 hover:text-foreground'
              onClick={() => setNotesOpen(true)}
              size='sm'
              variant='ghost'>
              {t("gameConfig.patchNotes")}
            </Button>
          )}
          {broken && (
            <Button
              className='h-7 min-w-[7.75rem] px-3 font-semibold text-xs active:translate-y-px disabled:opacity-90'
              disabled={reapply.isPending}
              onClick={() => reapply.mutate()}
              size='sm'>
              {reapply.isPending ? (
                <CircleNotchIcon className='size-3.5 animate-spin' />
              ) : (
                <ArrowsClockwiseIcon className='size-3.5' weight='bold' />
              )}
              {t(
                reapply.isPending
                  ? "gameConfig.reapplying"
                  : "gameConfig.reapply",
              )}
            </Button>
          )}
          <Button
            aria-label={t("gameConfig.dismiss")}
            className='size-7 text-foreground/50 hover:bg-primary/10 hover:text-foreground'
            onClick={dismiss}
            size='icon'
            title={t("gameConfig.dismiss")}
            variant='ghost'>
            <XIcon className='size-3.5' weight='bold' />
          </Button>
        </div>
      </div>
      {dialog}
    </>
  );
};
