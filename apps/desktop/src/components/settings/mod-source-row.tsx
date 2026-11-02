import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { MoreHorizontal, RefreshCw, Trash } from "@deadlock-mods/ui/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/providers/alert-dialog";
import { ModSourceIcon } from "@/components/shared/mod-source-icon";
import {
  NATIVE_SOURCES_QUERY_KEY,
  refreshNativeSource,
  removeNativeSource,
  setNativeSourceEnabled,
} from "@/lib/mod-sources";
import type { NativeSourceSummary } from "@/types/generated/NativeSourceSummary";

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
  return (
    <div className='flex items-start gap-3 py-3'>
      <ModSourceIcon
        source={{
          sourceName: source.descriptor.name,
          acceptedOrigin: source.acceptedOrigin,
          iconUrl: source.descriptor.iconUrl,
        }}
      />
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='text-sm font-medium'>{source.descriptor.name}</p>
        <p className='truncate text-xs text-muted-foreground'>
          {source.acceptedOrigin}
        </p>
        <p className='text-xs text-muted-foreground'>
          {source.lastSync
            ? t("modSources.lastSync", {
                date: new Date(source.lastSync).toLocaleString(),
              })
            : t("modSources.notSynced")}
        </p>
        {(source.lastError || error) && (
          <p role='alert' className='text-xs text-destructive'>
            {error?.message ?? source.lastError} {t("modSources.cachedResults")}
          </p>
        )}
      </div>
      <Button
        variant='outline'
        size='sm'
        disabled={busy || !source.enabled}
        aria-label={t("modSources.refresh", { name: source.descriptor.name })}
        onClick={() => refresh.mutate()}>
        <RefreshCw className='size-4' />
        {t("modSources.refreshAction")}
      </Button>
      <Switch
        checked={source.enabled}
        disabled={busy}
        aria-label={t("modSources.enable", { name: source.descriptor.name })}
        onCheckedChange={(enabled) => toggle.mutate(enabled)}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size='icon'
            variant='ghost'
            disabled={busy}
            aria-label={t("modSources.more", { name: source.descriptor.name })}>
            <MoreHorizontal className='size-4' />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            className='text-destructive'
            onClick={() => remove.mutate()}>
            <Trash className='size-4' />
            {t("modSources.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
