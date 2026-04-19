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
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowSquareOutIcon, CopyIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MultiFileDownloadDialog } from "@/components/downloads/multi-file-download-dialog";
import { useServerJoin } from "@/hooks/use-server-join";
import { isStagingActive, useServerStage } from "@/hooks/use-server-stage";
import logger from "@/lib/logger";
import { joinServer } from "./server-join/join-action";
import RequirementRow from "./server-join/requirement-row";

interface ServerJoinDialogProps {
  server: ServerBrowserEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ServerJoinDialog = ({
  server,
  open,
  onOpenChange,
}: ServerJoinDialogProps) => {
  const { t } = useTranslation();
  const join = useServerJoin(server);
  const stager = useServerStage();
  const [password, setPassword] = useState("");
  const [keepActiveProfile, setKeepActiveProfile] = useState(false);

  if (!server) return null;

  const passwordOk =
    !server.password_protected || password.length > 0 || !!server.gateway_url;
  const staging = isStagingActive(stager.state.phase);

  const handleJoin = async () => {
    try {
      if (server.required_mods.length > 0) {
        await stager.stage(server, {
          layered: keepActiveProfile,
          requirements: join.requirements,
        });
      }
      await joinServer({
        server,
        password,
        t,
        onComplete: () => {
          onOpenChange(false);
          stager.reset();
        },
      });
    } catch (err) {
      logger.withError(err).error("Server join failed");
      toast.error(
        err instanceof Error ? err.message : t("servers.detail.unknown"),
      );
    }
  };

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

  const customDownloads = stager.state.pendingCustomDownloads;
  const fileSelection = stager.state.pendingFileSelection;
  const showCancelDisabled =
    staging &&
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
            <ScrollArea className='max-h-64 rounded-md border'>
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
            </ScrollArea>

            <div className='flex items-start gap-2 rounded-md border border-border/60 bg-card/40 p-2'>
              <Checkbox
                checked={keepActiveProfile}
                disabled={staging}
                id='layered-mods'
                onCheckedChange={(v) => setKeepActiveProfile(v === true)}
              />
              <Label
                className='text-xs leading-tight font-normal'
                htmlFor='layered-mods'>
                {t("servers.detail.keepMyMods")}
              </Label>
            </div>

            {staging && stagingLabel && (
              <p className='text-xs text-muted-foreground'>{stagingLabel}</p>
            )}
            {stager.state.phase === "error" && stager.state.error && (
              <p className='text-xs text-red-400'>{stager.state.error}</p>
            )}

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

        <DialogFooter>
          <Button
            disabled={showCancelDisabled}
            onClick={() => {
              onOpenChange(false);
              stager.reset();
            }}
            variant='ghost'>
            Cancel
          </Button>
          <Button
            className='gap-2'
            disabled={!passwordOk || staging || join.isLoading}
            isLoading={staging}
            onClick={handleJoin}>
            {server.gateway_url ? (
              <>
                <ArrowSquareOutIcon className='h-4 w-4' weight='bold' />
                {t("servers.detail.open")}
              </>
            ) : (
              <>
                <CopyIcon className='h-4 w-4' weight='bold' />
                {t("servers.detail.copyConnect")}
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
