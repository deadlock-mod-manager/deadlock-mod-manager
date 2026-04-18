import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import HostServerCta from "@/components/server-browser/host-server-cta";
import RelayStatusPopover from "@/components/server-browser/relay-status-popover";
import ServerDetailPanel from "@/components/server-browser/server-detail-panel";
import ServerFilters, {
  type ServerFiltersValue,
} from "@/components/server-browser/server-filters";
import ServerTable from "@/components/server-browser/server-table";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import { useServerBrowserData } from "@/hooks/use-server-browser-data";

const DEFAULT_FILTERS: ServerFiltersValue = {
  search: "",
  hasPlayers: false,
  password: "all",
  gameMode: "",
  region: "",
};

const Servers = () => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<ServerFiltersValue>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    servers,
    total,
    relays,
    availableGameModes,
    availableRegions,
    serversQuery,
    allRelaysFailed,
  } = useServerBrowserData(filters);

  const selectedServer: ServerBrowserEntry | null = useMemo(() => {
    if (!selectedId) return null;
    return servers.find((s) => s.id === selectedId) ?? null;
  }, [servers, selectedId]);

  // Auto-clear selection if it no longer exists in the result set.
  useEffect(() => {
    if (selectedId && !selectedServer && servers.length > 0) {
      setSelectedId(null);
    }
  }, [selectedId, selectedServer, servers.length]);

  return (
    <div className='flex h-full w-full flex-col gap-4 overflow-hidden pl-4 pr-2 pb-4'>
      <div className='flex flex-wrap items-start justify-between gap-3 rounded-lg'>
        <PageTitle
          subtitle={t("servers.subtitle")}
          title={t("servers.title")}
        />
        <div className='flex items-center gap-2'>
          <RelayStatusPopover relays={relays} />
        </div>
      </div>

      <ServerFilters
        availableGameModes={availableGameModes}
        availableRegions={availableRegions}
        isFetching={serversQuery.isFetching}
        onChange={setFilters}
        onRefresh={() => serversQuery.refetch()}
        total={total}
        value={filters}
      />

      {allRelaysFailed && (
        <Alert>
          <WarningIcon className='size-4' />
          <AlertDescription>
            {t("servers.empty.errorDescription")}
          </AlertDescription>
        </Alert>
      )}

      <ErrorBoundary>
        <div className='flex min-h-0 flex-1 gap-4'>
          <ServerTable
            isError={serversQuery.isError}
            isLoading={serversQuery.isLoading}
            onSelect={(s) => setSelectedId(s.id)}
            selectedId={selectedId}
            servers={servers}
          />

          {servers.length > 0 && (
            <ServerDetailPanel
              onClose={() => setSelectedId(null)}
              server={selectedServer}
            />
          )}
        </div>
      </ErrorBoundary>

      <HostServerCta />
    </div>
  );
};

export default Servers;
