import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  InfoIcon,
  ShieldSlashIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { pickerPingTone, pickerRoutingStatus } from "@/lib/server-picker";
import { cn } from "@/lib/utils";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";
import type { ServerPickerState } from "@/types/generated/ServerPickerState";

interface PickerStatusProps {
  state?: ServerPickerState;
  busy: boolean;
  restoring: boolean;
  fastest: { location: ServerPickerLocation; latencyMs: number } | null;
  refreshing: boolean;
  canRefresh: boolean;
  onRestore: () => void;
  onRefresh: () => void;
}

export const PickerStatus = ({
  state,
  busy,
  restoring,
  fastest,
  refreshing,
  canRefresh,
  onRestore,
  onRefresh,
}: PickerStatusProps) => {
  const { t } = useTranslation();
  const restricted = state?.observationKnown && state.hasRestrictions;
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        restricted &&
          "rounded-lg border border-primary/25 bg-primary/[0.07] py-2 pl-2 pr-1.5",
      )}>
      {restricted && (
        <span
          aria-hidden
          className='flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary'>
          <ShieldSlashIcon className='size-5' />
        </span>
      )}
      <div className='min-w-0 space-y-0.5'>
        <p
          aria-live='polite'
          className={cn(
            "flex items-center gap-2 leading-tight",
            restricted
              ? "text-sm font-semibold text-primary"
              : "text-xs text-muted-foreground",
          )}>
          {!restricted && (
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full bg-muted-foreground",
                busy && "animate-pulse motion-reduce:animate-none",
              )}
            />
          )}
          {t(
            busy
              ? restoring
                ? "serverPicker.restoring"
                : "serverPicker.applying"
              : pickerRoutingStatus(state),
            { count: state?.observedBlockedLocations.length ?? 0 },
          )}
        </p>
        {fastest && (
          <p
            aria-live='polite'
            className='flex max-w-64 items-center gap-1 text-[11px] leading-tight text-muted-foreground'>
            <span className='shrink-0'>{t("serverPicker.fastestAllowed")}</span>
            <span
              className='truncate font-medium text-foreground'
              title={fastest.location.name}>
              {fastest.location.name}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                pickerPingTone(fastest.latencyMs),
              )}>
              {t("serverPicker.milliseconds", {
                count: Math.round(fastest.latencyMs),
              })}
            </span>
          </p>
        )}
      </div>
      <div className='ml-1 flex items-center gap-0.5'>
        <Button
          disabled={
            busy ||
            state?.capability.supported === false ||
            (state?.observationKnown &&
              state.rulesMatch &&
              !state.hasRestrictions &&
              state.blockedLocations.length === 0)
          }
          isLoading={restoring}
          onClick={onRestore}
          size='sm'
          variant='ghost'
          className={cn(
            restricted &&
              "h-8 border border-primary/35 text-primary hover:bg-primary/15 hover:text-primary",
          )}
          title={t("serverPicker.restore")}>
          {!restoring && <ArrowCounterClockwiseIcon aria-hidden />}
          {t("serverPicker.restoreShort")}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={t("serverPicker.about")}
              size='icon'
              variant='ghost'
              className={cn(
                "size-8",
                restricted
                  ? "text-primary/60 hover:text-primary"
                  : "text-muted-foreground",
              )}>
              <InfoIcon aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align='end'
            className='w-80 space-y-3 text-xs leading-relaxed motion-reduce:animate-none'>
            <p className='font-medium'>{t("serverPicker.about")}</p>
            <p className='text-muted-foreground'>
              {t("serverPicker.routingNote")}
            </p>
            <p className='text-muted-foreground'>
              {t("serverPicker.persistence")}
            </p>
            {state?.capability.scope === "application" && (
              <p className='text-muted-foreground'>
                {t("serverPicker.applicationScope")}
              </p>
            )}
            {state?.capability.scope === "system" && (
              <p className='text-muted-foreground'>
                {t("serverPicker.systemScope")}
              </p>
            )}
            <div className='flex items-center justify-between gap-3 border-t border-border/60 pt-3'>
              <p className='text-muted-foreground'>
                {state?.catalog
                  ? t("serverPicker.catalogUpdated", {
                      time: new Date(state.catalog.fetchedAt).toLocaleString(),
                    })
                  : t("serverPicker.noCatalog")}
              </p>
              <Button
                size='sm'
                variant='outline'
                className='h-7 shrink-0 px-2.5 text-xs'
                disabled={!canRefresh}
                isLoading={refreshing}
                onClick={onRefresh}>
                {!refreshing && <ArrowsClockwiseIcon aria-hidden />}
                {t("serverPicker.refreshShort")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
