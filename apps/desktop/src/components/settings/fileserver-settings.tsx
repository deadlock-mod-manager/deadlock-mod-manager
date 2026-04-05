import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Activity, Link, RefreshCw, Zap } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { useFileservers } from "@/hooks/use-fileservers";
import type { FileserverPreference } from "@/lib/store/slices/network";
import { FileServerCard } from "./fileserver-card";
import { MetaCard } from "./meta-card";

export const FileserverSettings = () => {
  const { t } = useTranslation();
  const {
    effectivePreference,
    fileserverLatencyMs,
    isPending,
    isError,
    latencyMutation,
    refetch,
    select,
    sortedServers,
  } = useFileservers();

  const selectWithToast = (value: FileserverPreference) => {
    select(value);
    toast.success(t("settings.fileserverPreferenceSaved"));
  };

  return (
    <div className='space-y-6'>
      <div
        aria-label={t("settings.network")}
        className='grid grid-cols-2 gap-3'
        role='radiogroup'>
        <MetaCard
          description={t("settings.fileserverDefault")}
          icon={Link}
          label={t("settings.fileserverDefaultTitle")}
          onClick={() => selectWithToast("default")}
          selected={effectivePreference === "default"}
        />
        <MetaCard
          description={t("settings.fileserverAuto")}
          icon={Zap}
          label={t("settings.fileserverAutoTitle")}
          onClick={() => selectWithToast("auto")}
          selected={effectivePreference === "auto"}
        />
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Button
          disabled={isPending || sortedServers.length === 0}
          onClick={() => refetch()}
          type='button'
          variant='outline'>
          <RefreshCw className='h-4 w-4' />
          {t("settings.fileserverRefresh")}
        </Button>
        <Button
          disabled={
            latencyMutation.isPending || sortedServers.length === 0 || isPending
          }
          onClick={() => latencyMutation.mutate(sortedServers)}
          type='button'
          variant='secondary'>
          <Activity className='h-4 w-4' />
          {latencyMutation.isPending
            ? t("settings.fileserverTesting")
            : t("settings.fileserverTestServers")}
        </Button>
      </div>

      {latencyMutation.error ? (
        <p className='text-destructive text-sm'>
          {latencyMutation.error.message}
        </p>
      ) : null}

      {isError ? (
        <p className='text-destructive text-sm'>
          {t("settings.fileserverLoadError")}
        </p>
      ) : null}

      {isPending ? (
        <p className='text-muted-foreground text-sm'>{t("common.loading")}</p>
      ) : (
        <div
          aria-label={t("settings.network")}
          className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'
          role='radiogroup'>
          {sortedServers.map((s) => (
            <FileServerCard
              key={s.id}
              latencyMs={fileserverLatencyMs[s.id]}
              onClick={() => selectWithToast(s.id)}
              selected={effectivePreference === s.id}
              server={s}
            />
          ))}
        </div>
      )}
    </div>
  );
};
