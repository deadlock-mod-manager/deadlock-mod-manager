import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  LightbulbIcon,
  PuzzlePieceIcon,
  TargetIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useBisect } from "@/hooks/use-bisect";
import { usePersistedStore } from "@/lib/store";
import type { BisectSession } from "@/lib/store/slices/bisect";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";
import { ModThumb } from "./mod-thumb";

const isLocalMod = (mod: LocalMod) =>
  mod.remoteUrl?.startsWith("local://") ?? false;

type ResultDialogProps = {
  session: BisectSession;
  open: boolean;
  onHide: () => void;
};

export const BisectResultDialog = ({
  session,
  open,
  onHide,
}: ResultDialogProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { run, isPending } = useBisect();
  const localMods = usePersistedStore((state) => state.localMods);
  const culpritIds = session.culprits ?? [];
  const culprits = culpritIds
    .map((id) => localMods.find((mod) => mod.remoteId === id))
    .filter((mod): mod is LocalMod => mod !== undefined);
  const notMods = culpritIds.length === 0;
  const together = culpritIds.length > 1;
  const kind = notMods ? "notMods" : together ? "together" : "single";
  const Icon = notMods
    ? CheckCircleIcon
    : together
      ? PuzzlePieceIcon
      : TargetIcon;

  const viewMod = (mod: LocalMod) => {
    onHide();
    navigate(`/mods/${mod.remoteId}`);
  };

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onHide()} open={open}>
      <DialogContent className='gap-5 sm:max-w-lg'>
        <DialogHeader className='items-center text-center sm:text-center'>
          <div className='relative mb-1 flex size-14 items-center justify-center'>
            <span
              aria-hidden
              className={cn(
                "onboarding-pulse-ring absolute inset-0 rounded-full",
                notMods ? "bg-status-ok/30" : "bg-destructive/30",
              )}
            />
            <span
              className={cn(
                "relative flex size-14 items-center justify-center rounded-full",
                notMods ? "bg-status-ok/15" : "bg-destructive/15",
              )}>
              <Icon
                className={cn(
                  "size-7",
                  notMods ? "text-status-ok" : "text-destructive",
                )}
                weight='duotone'
              />
            </span>
          </div>
          <DialogTitle>
            {t(`bisect.result.${kind}.title`, {
              name: culprits[0]?.name ?? t("bisect.result.removedMod"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t(`bisect.result.${kind}.body`, { count: session.round })}
          </DialogDescription>
        </DialogHeader>

        {culprits.length > 0 && (
          <ul className='space-y-2'>
            {culprits.map((mod, index) => (
              <li
                className='flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:animate-in motion-safe:fill-mode-both motion-safe:duration-500'
                key={mod.remoteId}
                style={{ animationDelay: `${150 + index * 120}ms` }}>
                <ModThumb className='size-12' mod={mod} />
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium text-sm'>{mod.name}</p>
                  <p className='truncate text-muted-foreground text-xs'>
                    {mod.author}
                  </p>
                </div>
                {!isLocalMod(mod) && (
                  <Button
                    className='h-7 px-2.5 text-xs'
                    onClick={() => viewMod(mod)}
                    size='sm'
                    variant='ghost'>
                    {t("bisect.result.viewMod")}
                    <ArrowSquareOutIcon className='size-3.5' />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className='flex items-start gap-2 text-muted-foreground text-xs'>
          <LightbulbIcon className='mt-px size-4 shrink-0' weight='duotone' />
          {t(`bisect.result.${kind}.tip`)}
        </p>

        <DialogFooter className='flex-col gap-3 sm:flex-col sm:space-x-0'>
          <div className='flex flex-col-reverse gap-2 sm:flex-row'>
            {notMods ? (
              <Button
                className='flex-1'
                disabled={isPending}
                onClick={() => run({ type: "finish", disableCulprits: false })}>
                {t("bisect.result.restore")}
              </Button>
            ) : (
              <>
                <Button
                  className='flex-1'
                  disabled={isPending}
                  onClick={() =>
                    run({ type: "finish", disableCulprits: false })
                  }
                  variant='outline'>
                  {t("bisect.result.restoreAll")}
                </Button>
                <Button
                  className='flex-1'
                  disabled={isPending}
                  onClick={() =>
                    run({ type: "finish", disableCulprits: true })
                  }>
                  {t("bisect.result.disableCulprits", {
                    count: culpritIds.length,
                  })}
                </Button>
              </>
            )}
          </div>
          {session.history.length > 0 && (
            <Button
              className='h-8 self-center text-muted-foreground text-xs'
              disabled={isPending}
              onClick={() => run({ type: "undo" })}
              size='sm'
              variant='ghost'>
              <ArrowCounterClockwiseIcon className='size-3.5' />
              {t("bisect.result.undo")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
