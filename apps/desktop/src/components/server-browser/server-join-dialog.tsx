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
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import { useConfirm } from "@/components/providers/alert-dialog";
import { useServerJoin } from "@/hooks/use-server-join";
import { isStagingActive, useServerStage } from "@/hooks/use-server-stage";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { getAdditionalArgs } from "@/lib/utils";
import { joinServer } from "./server-join/join-action";
import RequirementRow from "./server-join/requirement-row";

interface ServerJoinDialogProps {
  server: ServerBrowserEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GAME_EXIT_POLL_MS = 500;
const GAME_EXIT_TIMEOUT_MS = 20_000;

const isGameRunning = async (): Promise<boolean> => {
  try {
    return await invoke<boolean>("is_game_running");
  } catch (err) {
    logger
      .withError(err)
      .warn("Could not determine whether Deadlock is running");
    return false;
  }
};

const waitForGameExit = async (): Promise<boolean> => {
  const deadline = Date.now() + GAME_EXIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await isGameRunning())) return true;
    await new Promise((resolve) => setTimeout(resolve, GAME_EXIT_POLL_MS));
  }
  return false;
};

const ServerJoinDialog = ({
  server,
  open,
  onOpenChange,
}: ServerJoinDialogProps) => {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const join = useServerJoin(server);
  const stager = useServerStage();
  const settings = usePersistedStore((s) => s.settings);
  const gamePresenceEnabled = usePersistedStore((s) => s.gamePresenceEnabled);
  const getActiveProfile = usePersistedStore((s) => s.getActiveProfile);
  const [password, setPassword] = useState("");
  const [keepActiveProfile, setKeepActiveProfile] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

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
  const busy = staging || isJoining;
  const needsMods = server.required_mods.length > 0;

  const reportOutcome = (
    outcome: Awaited<ReturnType<typeof joinServer>>,
  ): void => {
    switch (outcome.kind) {
      case "gateway":
        toast.info(t("servers.detail.openExternal"));
        return;
      case "launched":
        toast.success(t("servers.join.launched", { name: server.name }));
        if (outcome.passwordSkipped) {
          toast.warning(t("servers.join.passwordSkipped"), {
            duration: 15_000,
          });
        }
        return;
      case "steam-url":
        toast.success(t("servers.join.launched", { name: server.name }));
        return;
      case "manual":
        toast.warning(t("servers.join.manual", { code: outcome.code }), {
          duration: 20_000,
        });
    }
  };

  /**
   * gameinfo.gi is only read at startup, so anything we change for this
   * server needs Deadlock to be closed first.
   */
  const ensureGameClosed = async (): Promise<boolean> => {
    if (!(await isGameRunning())) return true;

    const shouldRestart = await confirm({
      title: t("servers.join.gameRunning.title"),
      body: t("servers.join.gameRunning.body"),
      actionButton: t("servers.join.gameRunning.restart"),
      cancelButton: t("common.cancel"),
      actionButtonVariant: "default",
    });
    if (!shouldRestart) return false;

    toast.info(t("servers.join.stopping"));
    try {
      await invoke("stop_game");
    } catch (err) {
      logger.withError(err).warn("Failed to stop the game before joining");
    }

    if (await waitForGameExit()) return true;

    toast.error(t("servers.join.gameStillRunning"));
    return false;
  };

  const handleJoin = async () => {
    setIsJoining(true);
    try {
      if (!server.gateway_url && !(await ensureGameClosed())) {
        return;
      }

      if (needsMods) {
        await stager.stage(server, {
          layered: keepActiveProfile,
          requirements: join.requirements,
        });
      } else if (!server.gateway_url) {
        // A previous join may have left a server addons path in gameinfo.gi;
        // this server needs none, so put the user's own profile back.
        try {
          await invoke("cleanup_stale_server_gameinfo", {
            activeProfileFolder: getActiveProfile()?.folderName ?? null,
          });
        } catch (err) {
          logger
            .withError(err)
            .warn("Stale server gameinfo cleanup failed; joining anyway");
        }
      }

      const additionalArgs = await getAdditionalArgs(
        Object.values(settings),
        gamePresenceEnabled,
      );

      const outcome = await joinServer({ server, password, additionalArgs });
      reportOutcome(outcome);
      onOpenChange(false);
      stager.reset();
    } catch (err) {
      logger.withError(err).error("Server join failed");
      toast.error(
        err instanceof Error ? err.message : t("servers.detail.unknown"),
      );
    } finally {
      setIsJoining(false);
    }
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
              {needsMods ? (
                <li>
                  {t("servers.join.summaryMods", {
                    count: server.required_mods.length,
                  })}
                </li>
              ) : (
                <li>{t("servers.join.summaryRestore")}</li>
              )}
              <li>{t("servers.join.summaryLaunch")}</li>
            </ol>
          </div>
        )}

        {busy && (stagingLabel || isJoining) && (
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
            isLoading={busy}
            onClick={handleJoin}>
            {server.gateway_url ? (
              <>
                <ArrowSquareOutIcon className='h-4 w-4' weight='bold' />
                {t("servers.detail.open")}
              </>
            ) : (
              <>
                {join.allReady ? (
                  <SignInIcon className='h-4 w-4' weight='bold' />
                ) : (
                  <DownloadSimpleIcon className='h-4 w-4' weight='bold' />
                )}
                {join.allReady
                  ? t("servers.detail.joinServer")
                  : t("servers.detail.downloadAndJoin")}
              </>
            )}
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
