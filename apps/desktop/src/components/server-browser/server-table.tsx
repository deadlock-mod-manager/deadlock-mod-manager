import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { GameControllerIcon, WarningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import ServerRow from "./server-row";

interface ServerTableProps {
  servers: ServerBrowserEntry[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (server: ServerBrowserEntry) => void;
}

const SKELETON_ROW_COUNT = 8;
const COLUMN_COUNT = 5;

const ServerTable = ({
  servers,
  isLoading,
  isError,
  selectedId,
  onSelect,
}: ServerTableProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/30 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset]'>
      <div className='flex-1 overflow-y-auto'>
        <table className='w-full border-separate border-spacing-0 text-sm'>
          <thead className='sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70'>
            <tr className='text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
              <th className='whitespace-nowrap border-b border-border/60 px-3 py-2'>
                {t("servers.table.name")}
              </th>
              <th className='whitespace-nowrap border-b border-border/60 px-3 py-2 text-right'>
                {t("servers.table.players")}
              </th>
              <th className='whitespace-nowrap border-b border-border/60 px-3 py-2'>
                {t("servers.table.map")}
              </th>
              <th className='whitespace-nowrap border-b border-border/60 px-3 py-2'>
                {t("servers.table.mode")}
              </th>
              <th className='whitespace-nowrap border-b border-border/60 px-3 py-2 text-right'>
                {t("servers.table.region")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isError ? (
              <tr>
                <td className='px-3 py-12' colSpan={COLUMN_COUNT}>
                  <Empty className='m-auto'>
                    <EmptyHeader>
                      <EmptyMedia variant='default'>
                        <WarningIcon className='size-12 text-rose-400' />
                      </EmptyMedia>
                      <EmptyTitle>{t("servers.empty.errorTitle")}</EmptyTitle>
                      <EmptyDescription>
                        {t("servers.empty.errorDescription")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </td>
              </tr>
            ) : isLoading ? (
              Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
                  key={i}
                  className='border-b border-border/40'>
                  <td className='px-3 py-3' colSpan={COLUMN_COUNT}>
                    <Skeleton className='h-8 w-full rounded-md' />
                  </td>
                </tr>
              ))
            ) : servers.length === 0 ? (
              <tr>
                <td className='px-3 py-12' colSpan={COLUMN_COUNT}>
                  <Empty className='m-auto'>
                    <EmptyHeader>
                      <EmptyMedia variant='default'>
                        <GameControllerIcon
                          className='size-12'
                          weight='duotone'
                        />
                      </EmptyMedia>
                      <EmptyTitle>{t("servers.empty.title")}</EmptyTitle>
                      <EmptyDescription>
                        {t("servers.empty.description")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </td>
              </tr>
            ) : (
              servers.map((server) => (
                <ServerRow
                  isSelected={server.id === selectedId}
                  key={server.id}
                  onSelect={onSelect}
                  server={server}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ServerTable;
