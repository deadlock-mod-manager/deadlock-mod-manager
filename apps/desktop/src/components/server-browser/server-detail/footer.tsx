import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { ArrowSquareOutIcon, SignInIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ServerJoinDialog from "../server-join-dialog";

interface ServerDetailFooterProps {
  server: ServerBrowserEntry;
  canJoin: boolean;
}

const ServerDetailFooter = ({ server, canJoin }: ServerDetailFooterProps) => {
  const { t } = useTranslation();
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <>
      <footer className='space-y-2 border-t border-border/60 p-4'>
        <Button
          className='w-full gap-2'
          disabled={!canJoin}
          onClick={() => setJoinOpen(true)}>
          {server.gateway_url ? (
            <ArrowSquareOutIcon className='size-4' weight='bold' />
          ) : (
            <SignInIcon className='size-4' weight='bold' />
          )}
          {t("servers.detail.join")}
        </Button>
        {!canJoin && (
          <p className='text-center text-[11px] text-muted-foreground'>
            {t("servers.detail.noConnect")}
          </p>
        )}
      </footer>
      <ServerJoinDialog
        onOpenChange={setJoinOpen}
        open={joinOpen}
        server={server}
      />
    </>
  );
};

export default ServerDetailFooter;
