import type { ServerBrowserEntry } from "@deadlock-mods/shared";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  GameControllerIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import ServerRow from "./server-row";
import {
  nextSort,
  type ServerSort,
  type ServerSortKey,
  sortServers,
} from "./server-sort";

interface ServerTableProps {
  servers: ServerBrowserEntry[];
  isLoading: boolean;
  isError: boolean;
  selectedId: string | null;
  onSelect: (server: ServerBrowserEntry) => void;
  pings: Partial<Record<string, number | null>>;
}

const SKELETON_ROW_COUNT = 8;

const COLUMNS: { key: ServerSortKey; align: string }[] = [
  { key: "name", align: "" },
  { key: "players", align: "text-right justify-end" },
  { key: "map", align: "" },
  { key: "ping", align: "text-center justify-center" },
  { key: "region", align: "text-right justify-end" },
];
const COLUMN_COUNT = COLUMNS.length;

const SortIcon = ({
  sort,
  column,
}: {
  sort: ServerSort | null;
  column: ServerSortKey;
}) => {
  if (sort?.key !== column) {
    return <CaretUpDownIcon className='size-3 opacity-40' />;
  }
  return sort.direction === "asc" ? (
    <CaretUpIcon className='size-3' weight='bold' />
  ) : (
    <CaretDownIcon className='size-3' weight='bold' />
  );
};

const ServerTable = ({
  servers,
  isLoading,
  isError,
  selectedId,
  onSelect,
  pings,
}: ServerTableProps) => {
  const { t } = useTranslation();
  const [sort, setSort] = useState<ServerSort | null>(null);
  const sorted = useMemo(
    () => sortServers(servers, sort, pings),
    [servers, sort, pings],
  );

  return (
    <div className='flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-[0_1px_0_rgb(255_255_255/0.04)_inset]'>
      <div className='flex-1 overflow-y-auto'>
        <table className='w-full border-separate border-spacing-0 text-sm'>
          <thead className='sticky top-0 z-10 bg-card'>
            <tr className='text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'>
              {COLUMNS.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    aria-sort={
                      active
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className={cn(
                      "whitespace-nowrap border-b border-border/60 px-3 py-2",
                      column.align,
                    )}
                    key={column.key}>
                    <button
                      className={cn(
                        "inline-flex w-full select-none items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
                        column.align,
                        active && "text-foreground",
                      )}
                      onClick={() =>
                        setSort((current) => nextSort(current, column.key))
                      }
                      type='button'>
                      {t(`servers.table.${column.key}`)}
                      <SortIcon column={column.key} sort={sort} />
                    </button>
                  </th>
                );
              })}
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
              sorted.map((server) => (
                <ServerRow
                  isSelected={server.id === selectedId}
                  key={server.id}
                  onSelect={onSelect}
                  pingMs={pings[server.id]}
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
