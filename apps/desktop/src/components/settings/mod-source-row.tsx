import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { MoreHorizontal, Trash } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DateDisplay } from "@/components/date-display";
import { useConfirm } from "@/components/providers/alert-dialog";
import { ModSourceIcon } from "@/components/shared/mod-source-icon";
import {
  NATIVE_SOURCES_QUERY_KEY,
  refreshNativeSource,
  removeNativeSource,
  setNativeSourceEnabled,
} from "@/lib/mod-sources";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";
import { SourceIconTile } from "./source-icon-tile";

export const ModSourceRow = ({ source }: { source: NativeSourceSummary }) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const invalidateSource = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: NATIVE_SOURCES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ["check-mod-updates"] }),
      queryClient.invalidateQueries({ queryKey: ["mod"] }),
      queryClient.invalidateQueries({ queryKey: ["mod-downloads"] }),
    ]);
  const refresh = useMutation({
    mutationFn: () => refreshNativeSource(source.key),
    onSettled: invalidateSource,
    meta: { skipGlobalErrorHandler: true },
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      setNativeSourceEnabled(source.key, enabled),
    onSuccess: invalidateSource,
    meta: { skipGlobalErrorHandler: true },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const accepted = await confirm({
        title: t("modSources.removeTitle", { name: source.descriptor.name }),
        body: t("modSources.removeDescription"),
        actionButton: t("modSources.remove"),
        actionButtonVariant: "destructive",
      });
      if (accepted) await removeNativeSource(source.key);
    },
    onSuccess: invalidateSource,
    meta: { skipGlobalErrorHandler: true },
  });
  const error = refresh.error ?? toggle.error ?? remove.error;
  const busy = refresh.isPending || toggle.isPending || remove.isPending;
  const name = source.descriptor.name;
  const refreshLabel = t("modSources.refresh", { name });
  return (
    <div className='col-span-full grid grid-cols-subgrid items-center py-3'>
      <SourceIconTile>
        <ModSourceIcon
          source={{
            sourceName: name,
            acceptedOrigin: source.acceptedOrigin,
            iconUrl: source.descriptor.iconUrl,
          }}
        />
      </SourceIconTile>
      <div className='min-w-0 space-y-0.5'>
        <p className='flex items-center gap-2 text-sm font-medium'>
          <span
            className={cn(
              "truncate",
              !source.enabled && "text-muted-foreground",
            )}>
            {name}
          </span>
          {!source.enabled && (
            <Badge variant='outline'>{t("modSources.disabled")}</Badge>
          )}
        </p>
        <p className='flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground'>
          <span className='truncate'>{source.acceptedOrigin}</span>
          {source.lastSync ? (
            <DateDisplay
              date={new Date(source.lastSync)}
              prefix={t("modSources.synced")}
            />
          ) : (
            <span>{t("modSources.notSynced")}</span>
          )}
        </p>
        {(source.lastError || error) && (
          <p role='alert' className='text-xs text-destructive'>
            {error?.message ?? source.lastError} {t("modSources.cachedResults")}
          </p>
        )}
      </div>
      <Switch
        checked={source.enabled}
        disabled={busy}
        aria-label={t("modSources.enable", { name })}
        onCheckedChange={(enabled) => toggle.mutate(enabled)}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-busy={refresh.isPending}
            aria-label={refreshLabel}
            className='text-muted-foreground hover:text-foreground'
            disabled={busy || !source.enabled}
            onClick={() => refresh.mutate()}
            size='icon'
            variant='outline'>
            <ArrowsClockwise
              aria-hidden
              className={cn(
                "size-4",
                refresh.isPending && "motion-safe:animate-spin",
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{refreshLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            disabled={busy}
            aria-label={t("modSources.more", { name })}>
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            className='text-destructive focus:bg-destructive/10 focus:text-destructive'
            onClick={() => remove.mutate()}>
            <Trash className='size-4' />
            {t("modSources.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
