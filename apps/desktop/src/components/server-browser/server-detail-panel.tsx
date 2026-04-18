import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ServerDetailEmptyState from "./server-detail/empty-state";
import ServerDetailFooter from "./server-detail/footer";
import ServerDetailHeader from "./server-detail/header";
import ServerDetailMetaSection from "./server-detail/meta-section";
import ServerDetailModsSection from "./server-detail/mods-section";
import ServerDetailPlayersSection from "./server-detail/players-section";

interface ServerDetailPanelProps {
  server: ServerBrowserEntry | null;
  onClose: () => void;
  className?: string;
}

const LIVE_THRESHOLD_MS = 60_000;

const isLive = (iso: string): boolean => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() < LIVE_THRESHOLD_MS;
  } catch {
    return false;
  }
};

const ServerDetailPanel = ({
  server,
  onClose,
  className,
}: ServerDetailPanelProps) => {
  const { t } = useTranslation();

  if (!server) {
    return <ServerDetailEmptyState className={className} />;
  }

  const canJoin = !!server.gateway_url || !!server.connect_code;

  return (
    <aside
      className={cn(
        "flex h-full w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/40 lg:w-[360px]",
        className,
      )}>
      <ServerDetailHeader
        isLive={isLive(server.last_seen)}
        onClose={onClose}
        server={server}
      />

      <ScrollArea className='flex-1'>
        <div className='space-y-5 p-4'>
          <ServerDetailMetaSection server={server} />

          <Separator />

          <ServerDetailPlayersSection players={server.players} />

          <Separator />

          <ServerDetailModsSection
            emptyText={t("servers.detail.noRequiredMods")}
            items={server.required_mods}
            title={t("servers.detail.requiredModsTitle")}
          />

          {server.mods.length > 0 && (
            <>
              <Separator />
              <ServerDetailModsSection
                items={server.mods}
                title={t("servers.detail.modsTitle")}
              />
            </>
          )}
        </div>
      </ScrollArea>

      <ServerDetailFooter canJoin={canJoin} server={server} />
    </aside>
  );
};

export default ServerDetailPanel;
