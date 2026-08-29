import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  RefreshCcw,
  Wrench,
  XCircle,
} from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Section, { SectionSkeleton } from "@/components/settings/section";
import { getErrorMessage } from "@/lib/errors";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type ShardInfo = {
  index: number;
  directory: string;
  exists: boolean;
  enabledVpks: number;
  manifestMods: number;
  outOfRangeVpks: boolean;
  inGameinfo: boolean;
};

type ShardDiagnostics = {
  profileFolder: string | null;
  shardCapacity: number;
  maxShards: number;
  shardingActive: boolean;
  shardsInUse: number;
  totalEnabledVpks: number;
  manifestVersion: number;
  manifestMods: number;
  manifestEnabledMods: number;
  expectedSearchPaths: string[];
  gameinfoSearchPaths: string[];
  searchPathsInSync: boolean;
  needsMigration: boolean;
  shards: ShardInfo[];
  issues: string[];
};

const TONE_CLASS = {
  neutral: "text-foreground",
  good: "text-green-600 dark:text-green-500",
  bad: "text-destructive",
} as const;

const StatTile = ({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: keyof typeof TONE_CLASS;
}) => (
  <div className='flex flex-col gap-1 rounded-md border border-border/50 bg-background/50 p-3'>
    <span className='text-[11px] uppercase tracking-wider text-muted-foreground'>
      {label}
    </span>
    <span className={cn("font-semibold tabular-nums", TONE_CLASS[tone])}>
      {value}
    </span>
  </div>
);

// A shard directory only matters once it holds files; empty ones are noise.
const isRelevant = (shard: ShardInfo) =>
  shard.exists || shard.enabledVpks > 0 || shard.manifestMods > 0;

const ShardDiagnostics = () => {
  const { t } = useTranslation();
  const [isResyncing, setIsResyncing] = useState(false);
  const activeProfile = usePersistedStore((state) => state.getActiveProfile());
  const profileFolder = activeProfile?.folderName ?? null;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["shard-diagnostics", profileFolder],
    queryFn: () =>
      invoke<ShardDiagnostics>("get_shard_diagnostics", { profileFolder }),
  });

  const handleResync = async () => {
    try {
      setIsResyncing(true);
      await invoke("resync_profile_shards", { profileFolder });
      await refetch();
      toast.success(t("developer.shards.resyncSuccess"));
    } catch (resyncError) {
      toast.error(getErrorMessage(resyncError));
    } finally {
      setIsResyncing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success(t("developer.shards.copied"));
    } catch (copyError) {
      toast.error(getErrorMessage(copyError));
    }
  };

  if (isLoading) {
    return (
      <SectionSkeleton>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-32 w-full' />
      </SectionSkeleton>
    );
  }

  if (error || !data) {
    return (
      <Section
        description={t("developer.shards.description")}
        title={t("developer.shards.title")}>
        <div className='flex items-center gap-2 text-destructive text-sm'>
          <XCircle className='h-4 w-4 shrink-0' />
          {error ? getErrorMessage(error) : t("developer.shards.unavailable")}
        </div>
      </Section>
    );
  }

  const relevantShards = data.shards.filter(isRelevant);

  return (
    <div className='space-y-4'>
      <Section
        action={
          <div className='flex gap-2'>
            <Button onClick={handleCopy} size='sm' variant='outline'>
              <Copy className='mr-2 h-4 w-4' />
              {t("developer.shards.copyJson")}
            </Button>
            <Button
              disabled={isResyncing}
              onClick={handleResync}
              size='sm'
              variant='outline'>
              <Wrench className='mr-2 h-4 w-4' />
              {t("developer.shards.resync")}
            </Button>
            <Button onClick={() => refetch()} size='sm' variant='outline'>
              <RefreshCcw className='mr-2 h-4 w-4' />
              {t("developer.shards.refresh")}
            </Button>
          </div>
        }
        description={t("developer.shards.description")}
        innerClassName='flex flex-col gap-4'
        title={t("developer.shards.title")}>
        <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
          <StatTile
            label={t("developer.shards.statSharding")}
            tone={data.shardingActive ? "good" : "neutral"}
            value={
              data.shardingActive
                ? t("developer.shards.active")
                : t("developer.shards.singleShard")
            }
          />
          <StatTile
            label={t("developer.shards.statShardsInUse")}
            value={`${data.shardsInUse} / ${data.maxShards}`}
          />
          <StatTile
            label={t("developer.shards.statEnabledVpks")}
            value={`${data.totalEnabledVpks}`}
          />
          <StatTile
            label={t("developer.shards.statCapacity")}
            value={`${data.shardCapacity}`}
          />
          <StatTile
            label={t("developer.shards.statGameinfo")}
            tone={data.searchPathsInSync ? "good" : "bad"}
            value={
              data.searchPathsInSync
                ? t("developer.shards.inSync")
                : t("developer.shards.outOfSync")
            }
          />
          <StatTile
            label={t("developer.shards.statMigration")}
            tone={data.needsMigration ? "bad" : "good"}
            value={
              data.needsMigration
                ? t("developer.shards.pending")
                : t("developer.shards.notNeeded")
            }
          />
        </div>

        <div className='text-muted-foreground text-sm'>
          {t("developer.shards.profileLine", {
            profile: data.profileFolder ?? t("developer.shards.defaultProfile"),
            version: data.manifestVersion,
            mods: data.manifestMods,
            enabled: data.manifestEnabledMods,
          })}
        </div>

        {data.issues.length > 0 ? (
          <div className='rounded-md border-l-4 border-yellow-500 bg-yellow-50 p-3 dark:bg-yellow-950/20'>
            <div className='mb-2 flex items-center gap-2 font-medium text-sm text-yellow-800 dark:text-yellow-200'>
              <AlertTriangle className='h-4 w-4' />
              {t("developer.shards.issuesFound", { count: data.issues.length })}
            </div>
            <ul className='list-disc space-y-1 pl-5 text-sm text-yellow-800 dark:text-yellow-200'>
              {data.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className='flex items-center gap-2 text-green-600 text-sm dark:text-green-500'>
            <CheckCircle className='h-4 w-4 shrink-0' />
            {t("developer.shards.noIssues")}
          </div>
        )}
      </Section>

      <Section
        description={t("developer.shards.shardTableDescription")}
        title={t("developer.shards.shardTableTitle")}>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='border-border/50 border-b text-left text-muted-foreground text-xs uppercase tracking-wider'>
                <th className='py-2 pr-4 font-medium'>
                  {t("developer.shards.colShard")}
                </th>
                <th className='py-2 pr-4 font-medium'>
                  {t("developer.shards.colEnabled")}
                </th>
                <th className='py-2 pr-4 font-medium'>
                  {t("developer.shards.colManifest")}
                </th>
                <th className='py-2 pr-4 font-medium'>
                  {t("developer.shards.colGameinfo")}
                </th>
                <th className='py-2 font-medium'>
                  {t("developer.shards.colDirectory")}
                </th>
              </tr>
            </thead>
            <tbody>
              {relevantShards.map((shard) => (
                <tr className='border-border/30 border-b' key={shard.index}>
                  <td className='py-2 pr-4 font-medium tabular-nums'>
                    {shard.index}
                  </td>
                  <td className='py-2 pr-4 tabular-nums'>
                    {shard.enabledVpks} / {data.shardCapacity}
                    {shard.outOfRangeVpks && (
                      <Badge className='ml-2' variant='destructive'>
                        {t("developer.shards.outOfRange")}
                      </Badge>
                    )}
                  </td>
                  <td className='py-2 pr-4 tabular-nums'>
                    {shard.manifestMods}
                  </td>
                  <td className='py-2 pr-4'>
                    {shard.inGameinfo ? (
                      <CheckCircle className='h-4 w-4 text-green-600 dark:text-green-500' />
                    ) : (
                      // A missing search path only matters for a shard that
                      // actually holds files.
                      <XCircle
                        className={cn(
                          "h-4 w-4",
                          shard.enabledVpks > 0
                            ? "text-destructive"
                            : "text-muted-foreground/40",
                        )}
                      />
                    )}
                  </td>
                  <td className='py-2 font-mono text-muted-foreground text-xs'>
                    {shard.directory}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        description={t("developer.shards.searchPathsDescription")}
        innerClassName='grid gap-4 md:grid-cols-2'
        title={t("developer.shards.searchPathsTitle")}>
        <div>
          <p className='mb-2 font-medium text-sm'>
            {t("developer.shards.expected")}
          </p>
          <ul className='space-y-1 font-mono text-xs'>
            {data.expectedSearchPaths.map((path) => (
              <li className='flex items-center gap-2' key={path}>
                {data.gameinfoSearchPaths.includes(path) ? (
                  <CheckCircle className='h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500' />
                ) : (
                  <XCircle className='h-3.5 w-3.5 shrink-0 text-destructive' />
                )}
                {path}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className='mb-2 font-medium text-sm'>
            {t("developer.shards.inGameinfoFile")}
          </p>
          {data.gameinfoSearchPaths.length === 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t("developer.shards.noGameinfoPaths")}
            </p>
          ) : (
            <ul className='space-y-1 font-mono text-xs text-muted-foreground'>
              {data.gameinfoSearchPaths.map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
};

export default ShardDiagnostics;
