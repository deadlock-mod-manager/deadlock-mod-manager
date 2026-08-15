import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import {
  type DeadworksContentPreview,
  type DeadworksContentProgress,
  useDeadworksContentProgress,
} from "@/hooks/use-deadworks-content-progress";
import { useJoinServer } from "@/hooks/use-join-server";
import { useServerJoin } from "@/hooks/use-server-join";
import { isStagingActive, useServerStage } from "@/hooks/use-server-stage";
import { formatSize } from "@/lib/utils";
import RequirementRow from "./server-join/requirement-row";

interface ServerJoinDialogProps {
  server: ServerBrowserEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The check and decompress steps report no byte progress of their own, so a
// size here would always read as 0 B.
const contentBytesLabel = (progress: DeadworksContentProgress): string => {
  if (progress.status !== "downloading" || progress.totalBytes <= 0) {
    return "";
  }
  return ` · ${formatSize(progress.bytesDownloaded)} / ${formatSize(progress.totalBytes)}`;
};

const contentStatusLabel = (
  progress: DeadworksContentProgress,
  t: TFunction,
): string => {
  switch (progress.status) {
    case "checking":
    case "downloading":
    case "ready":
      return progress.name;
    case "decompressing":
      return t("servers.staging.decompressing", { name: progress.name });
    default: {
      const exhaustive: never = progress.status;
      return exhaustive;
    }
  }
};

const ServerJoinDialog = ({
  server,
  open,
  onOpenChange,
}: ServerJoinDialogProps) => {
  const { t } = useTranslation();
  const join = useServerJoin(server);
  const stager = useServerStage();
  const joinMutation = useJoinServer(server, stager);
  const [password, setPassword] = useState("");
  const [keepActiveProfile, setKeepActiveProfile] = useState(false);
  const downloadingContent =
    stager.state.phase === "downloading-server-content";
  const contentProgress = useDeadworksContentProgress(
    open && downloadingContent,
  );

  const serverId = server?.id;
  const previewQuery = useQuery({
    queryKey: ["deadworks-content-preview", serverId],
    queryFn: () =>
      invoke<DeadworksContentPreview>("preview_deadworks_content", {
        serverId,
      }),
    enabled: open && !!serverId && !!server?.managed_content,
    staleTime: 60 * 1000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });

  const stagingLabel = useMemo(() => {
    switch (stager.state.phase) {
      case "creating-folder":
        return t("servers.staging.creatingFolder");
      case "downloading-mods":
        return stager.state.currentRequirement
          ? t("servers.staging.installingNamed", {
              name: stager.state.currentRequirement,
            })
          : t("servers.staging.installing");
      case "awaiting-file-selection":
        return t("servers.staging.awaitingFileSelection");
      case "awaiting-custom-confirm":
        return t("servers.staging.awaitingCustomConfirm");
      case "downloading-custom":
        return t("servers.staging.downloadingCustom");
      case "downloading-server-content":
        return t("servers.staging.downloadingServerContent");
      case "patching-gameinfo":
        return t("servers.staging.applying");
      default:
        return null;
    }
  }, [stager.state.phase, stager.state.currentRequirement, t]);

  if (!server) return null;

  const passwordOk =
    !server.password_protected || password.length > 0 || !!server.gateway_url;
  const staging = isStagingActive(stager.state.phase);
  const busy = staging || joinMutation.isPending;
  // Servers with managed content ship their maps and addons through their own
  // manifest instead of `required_mods`, so they need staging either way.
  const needsMods = server.required_mods.length > 0 || server.managed_content;

  const handleJoin = () => {
    joinMutation.mutate(
      {
        password,
        keepActiveProfile,
        requirements: join.requirements,
        needsMods,
      },
      {
        onSuccess: (outcome) => {
          if (outcome.kind === "cancelled") return;
          onOpenChange(false);
          stager.reset();
        },
      },
    );
  };

  const customDownloads = stager.state.pendingCustomDownloads;
  const fileSelection = stager.state.pendingFileSelection;
  const showCancelDisabled =
    busy &&
    stager.state.phase !== "awaiting-custom-confirm" &&
    stager.state.phase !== "awaiting-file-selection";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>{server.name}</DialogTitle>
          <DialogDescription>
            {server.player_count}/{server.max_players} •{" "}
            {server.map || t("servers.detail.unknown")} •{" "}
            {server.game_mode || t("servers.detail.unknown")}
          </DialogDescription>
        </DialogHeader>

        {server.password_protected && (
          <div className='space-y-1.5'>
            <Label className='text-xs' htmlFor='server-password'>
              {t("servers.detail.passwordPrompt")}
            </Label>
            <Input
              autoComplete='off'
              id='server-password'
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("servers.detail.passwordPlaceholder")}
              type='password'
              value={password}
            />
          </div>
        )}

        {join.hasRequirements && (
          <section className='space-y-2'>
            <header className='flex items-center justify-between gap-2'>
              <h3 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                {t("servers.detail.requiredModsTitle")} (
                {server.required_mods.length})
              </h3>
            </header>
            <div className='max-h-64 overflow-y-auto rounded-md border'>
              <div className='space-y-1 p-1.5'>
                {join.isLoading ? (
                  <>
                    <Skeleton className='h-12 w-full rounded-md' />
                    <Skeleton className='h-12 w-full rounded-md' />
                  </>
                ) : (
                  join.requirements.map((req) => (
                    <RequirementRow
                      key={req.remoteId ?? req.name}
                      requirement={req}
                    />
                  ))
                )}
              </div>
            </div>

            <div className='flex items-start gap-2 rounded-md border border-border/60 bg-card/40 p-2'>
              <Checkbox
                checked={keepActiveProfile}
                disabled={busy}
                id='layered-mods'
                onCheckedChange={(v) => setKeepActiveProfile(v === true)}
              />
              <Label
                className='text-xs leading-tight font-normal'
                htmlFor='layered-mods'>
                {t("servers.detail.keepMyMods")}
              </Label>
            </div>

            {customDownloads && customDownloads.length > 0 && (
              <div className='space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3'>
                <div className='space-y-1'>
                  <p className='text-xs font-semibold text-amber-300'>
                    {t("servers.staging.customConfirmTitle")}
                  </p>
                  <p className='text-[11px] text-muted-foreground'>
                    {t("servers.staging.customConfirmDescription")}
                  </p>
                </div>
                <ul className='space-y-1 font-mono text-[11px]'>
                  {customDownloads.map((d) => (
                    <li
                      className='flex flex-col gap-0.5 rounded bg-card/40 px-2 py-1'
                      key={d.url}>
                      <span className='truncate'>{d.requirementName}</span>
                      <span className='truncate text-muted-foreground'>
                        {d.host} → {d.fileName}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className='flex justify-end gap-2'>
                  <Button
                    onClick={stager.skipCustomDownloads}
                    size='sm'
                    variant='ghost'>
                    {t("servers.staging.customSkip")}
                  </Button>
                  <Button onClick={stager.confirmCustomDownloads} size='sm'>
                    {t("servers.staging.customConfirm")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        {!server.gateway_url && (
          <div className='space-y-1.5 rounded-md border border-border/60 bg-card/40 p-3'>
            <p className='text-xs font-semibold text-foreground'>
              {t("servers.join.summaryTitle")}
            </p>
            <ol className='list-inside list-decimal space-y-0.5 text-[11px] text-muted-foreground'>
              {server.required_mods.length > 0 && (
                <li>
                  {t("servers.join.summaryMods", {
                    count: server.required_mods.length,
                  })}
                </li>
              )}
              {server.managed_content && (
                <li>
                  {previewQuery.data && previewQuery.data.pendingBytes > 0
                    ? t("servers.join.summaryServerContentCounted", {
                        count: previewQuery.data.pendingItems,
                        total: previewQuery.data.totalItems,
                        size: formatSize(previewQuery.data.pendingBytes),
                      })
                    : t("servers.join.summaryServerContent")}
                </li>
              )}
              {!needsMods && <li>{t("servers.join.summaryRestore")}</li>}
              <li>{t("servers.join.summaryLaunch")}</li>
            </ol>
          </div>
        )}

        {busy && downloadingContent && (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
              <span className='truncate'>
                {contentProgress.current
                  ? contentStatusLabel(contentProgress.current, t)
                  : t("servers.staging.downloadingServerContent")}
              </span>
              {contentProgress.current && (
                <span className='shrink-0'>
                  {t("servers.staging.contentItemProgress", {
                    current: contentProgress.current.itemIndex + 1,
                    total: contentProgress.current.totalItems,
                  })}
                  {contentBytesLabel(contentProgress.current)}
                </span>
              )}
            </div>
            <Progress value={contentProgress.fraction * 100} />
          </div>
        )}
        {busy && !downloadingContent && (
          <p className='text-xs text-muted-foreground'>
            {stagingLabel ?? t("servers.join.launching")}
          </p>
        )}
        {stager.state.phase === "error" && stager.state.error && (
          <p className='text-xs text-red-400'>{stager.state.error}</p>
        )}

        <DialogFooter>
          <Button
            disabled={showCancelDisabled}
            onClick={() => {
              onOpenChange(false);
              stager.reset();
            }}
            variant='ghost'>
            {t("common.cancel")}
          </Button>
          <Button
            className='gap-2'
            disabled={!passwordOk || busy || join.isLoading}
            icon={
              server.gateway_url ? (
                <ArrowSquareOutIcon className='h-4 w-4' weight='bold' />
              ) : join.allReady ? (
                <SignInIcon className='h-4 w-4' weight='bold' />
              ) : (
                <DownloadSimpleIcon className='h-4 w-4' weight='bold' />
              )
            }
            isLoading={busy}
            onClick={handleJoin}>
            {server.gateway_url
              ? t("servers.detail.open")
              : join.allReady
                ? t("servers.detail.joinServer")
                : t("servers.detail.downloadAndJoin")}
          </Button>
        </DialogFooter>
      </DialogContent>

      {fileSelection && (
        <MultiFileDownloadDialog
          files={fileSelection.files}
          isOpen={true}
          modName={fileSelection.requirementName}
          onClose={stager.cancelFileSelection}
          onDownload={(selected) => stager.confirmFileSelection(selected)}
        />
      )}
    </Dialog>
  );
};

export default ServerJoinDialog;
