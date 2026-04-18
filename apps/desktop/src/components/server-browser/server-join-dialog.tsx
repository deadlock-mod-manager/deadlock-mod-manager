import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
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
import { ArrowSquareOutIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRequiredModInstall } from "@/hooks/use-required-mod-install";
import { useServerJoin } from "@/hooks/use-server-join";
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
  const {
    installingId,
    installSingle,
    installAll,
    enablingId,
    enableSingle,
    enableAll,
  } = useRequiredModInstall(join);
  const [password, setPassword] = useState("");

  if (!server) return null;

  const handleJoin = () =>
    joinServer({
      server,
      password,
      t,
      onComplete: () => onOpenChange(false),
    });

  const canJoin = join.allReady && !join.isLoading;
  const passwordOk =
    !server.password_protected || password.length > 0 || !!server.gateway_url;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-xl border-0 shadow-2xl'>
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
              {join.missing.length > 0 && (
                <Button
                  disabled={installingId !== null}
                  onClick={installAll}
                  size='sm'
                  variant='outline'>
                  {t("servers.detail.installAll")}
                </Button>
              )}
              {join.missing.length === 0 && join.disabled.length > 0 && (
                <Button
                  disabled={enablingId !== null}
                  onClick={enableAll}
                  size='sm'
                  variant='outline'>
                  {t("servers.detail.enableAll")}
                </Button>
              )}
            </header>
            <ScrollArea className='max-h-64 rounded-md border'>
              <div className='space-y-1 p-1.5'>
                {join.isLoading ? (
                  <>
                    <Skeleton className='h-12 w-full rounded-md' />
                    <Skeleton className='h-12 w-full rounded-md' />
                  </>
                ) : (
                  join.requirements.map((req, i) => (
                    <RequirementRow
                      enabling={enablingId === req.remoteId}
                      installing={installingId === req.remoteId}
                      key={`${req.name}-${i}`}
                      onEnable={enableSingle}
                      onInstall={installSingle}
                      requirement={req}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
            {join.missing.length > 0 && (
              <p className='text-xs text-amber-400'>
                {t("servers.detail.missingMods", {
                  count: join.missing.length,
                })}
              </p>
            )}
            {join.disabled.length > 0 && (
              <p className='text-xs text-amber-400'>
                {t("servers.detail.disabledMods", {
                  count: join.disabled.length,
                })}
              </p>
            )}
          </section>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='ghost'>
            Cancel
          </Button>
          <Button
            className='gap-2'
            disabled={!canJoin || !passwordOk}
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
    </Dialog>
  );
};

export default ServerJoinDialog;
