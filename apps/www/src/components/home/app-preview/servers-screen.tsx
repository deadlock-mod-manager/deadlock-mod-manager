import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CellSignalFullIcon,
  GameControllerIcon,
  LockKeyIcon,
  MapPinIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageTitle } from "./parts";
import { SERVERS } from "./preview-servers";
import { usePreviewState } from "./preview-state";

const pingClassName = (ping: number) =>
  ping < 60
    ? "text-emerald-400"
    : ping < 120
      ? "text-amber-400"
      : "text-rose-400";

export const ServersScreen = () => {
  const { t } = useTranslation("preview");
  const { notify } = usePreviewState();
  const [selected, setSelected] = useState(SERVERS[0].name);
  const server = SERVERS.find((candidate) => candidate.name === selected);

  return (
    <div className='flex h-full flex-col gap-4 pr-2 pb-4 pl-4'>
      <PageTitle title={t("servers.title")} subtitle={t("servers.subtitle")} />
      <div className='flex min-h-0 flex-1 gap-4'>
        <div className='min-w-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-card'>
          <table className='w-full border-separate border-spacing-0 text-sm'>
            <thead>
              <tr className='text-left font-semibold text-[10px] text-muted-foreground uppercase tracking-wider'>
                <th className='border-border/60 border-b px-3 py-2'>
                  {t("servers.columns.name")}
                </th>
                <th className='w-[110px] border-border/60 border-b px-3 py-2 text-right'>
                  {t("servers.columns.players")}
                </th>
                <th className='w-[130px] border-border/60 border-b px-3 py-2'>
                  {t("servers.columns.map")}
                </th>
                <th className='w-[90px] border-border/60 border-b px-3 py-2 text-center'>
                  {t("servers.columns.ping")}
                </th>
              </tr>
            </thead>
            <tbody>
              {SERVERS.map((row) => {
                const fill = row.players / row.max;
                const isSelected = row.name === selected;
                return (
                  <tr
                    key={row.name}
                    onClick={() => setSelected(row.name)}
                    className={cn(
                      "cursor-pointer hover:bg-card/60 hover:shadow-[inset_2px_0_0_hsl(var(--primary))]",
                      isSelected &&
                        "bg-primary/5 shadow-[inset_2px_0_0_hsl(var(--primary))]",
                    )}>
                    <td className='border-border/40 border-b px-3 py-2.5'>
                      <button
                        type='button'
                        onClick={() => setSelected(row.name)}
                        className='flex items-center gap-1.5 text-left font-medium'>
                        {row.name}
                        {row.locked && (
                          <LockKeyIcon
                            weight='fill'
                            className='size-3.5 text-amber-400'
                          />
                        )}
                        {row.verified && (
                          <ShieldCheckIcon
                            weight='fill'
                            className='size-3.5 text-sky-400'
                          />
                        )}
                      </button>
                      {row.mods > 0 && (
                        <span className='mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground'>
                          <PuzzlePieceIcon className='size-3' />
                          {t("servers.requiredModsBadge", { total: row.mods })}
                        </span>
                      )}
                    </td>
                    <td className='border-border/40 border-b px-3 py-2.5 text-right'>
                      <span className='inline-flex items-center gap-1 font-mono tabular-nums'>
                        <UsersThreeIcon className='size-3.5 text-muted-foreground' />
                        {row.players}
                        <span className='text-muted-foreground'>
                          /{row.max}
                        </span>
                      </span>
                      <div className='mt-1.5 h-1 rounded-full bg-muted/60'>
                        <div
                          className={cn(
                            "h-full rounded-full",
                            fill >= 1
                              ? "bg-rose-400"
                              : fill >= 0.75
                                ? "bg-amber-400"
                                : "bg-emerald-400",
                          )}
                          style={{ width: `${fill * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className='border-border/40 border-b px-3 py-2.5 text-muted-foreground'>
                      <span className='inline-flex items-center gap-1 font-mono text-xs'>
                        <MapPinIcon
                          weight='fill'
                          className='size-3 opacity-60'
                        />
                        {row.map}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "border-border/40 border-b px-3 py-2.5 text-center",
                        pingClassName(row.ping),
                      )}>
                      <span className='inline-flex items-center gap-1 text-xs tabular-nums'>
                        <CellSignalFullIcon
                          weight='bold'
                          className='size-3.5'
                        />
                        {t("servers.ping", { ping: row.ping })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {server && (
          <aside className='flex w-64 shrink-0 flex-col gap-3 rounded-lg border border-border/60 bg-card p-4'>
            <div className='font-semibold'>{server.name}</div>
            <dl className='grid grid-cols-2 gap-y-2 text-xs'>
              <dt className='text-muted-foreground'>
                {t("servers.details.map")}
              </dt>
              <dd className='font-mono'>{server.map}</dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.players")}
              </dt>
              <dd className='tabular-nums'>
                {server.players}/{server.max}
              </dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.region")}
              </dt>
              <dd>{server.region}</dd>
              <dt className='text-muted-foreground'>
                {t("servers.details.requiredMods")}
              </dt>
              <dd>{server.mods}</dd>
            </dl>
            <button
              type='button'
              disabled={server.players >= server.max}
              onClick={() =>
                notify(
                  t("servers.joining.title", { name: server.name }),
                  server.mods > 0
                    ? t("servers.joining.withMods")
                    : t("servers.joining.withoutMods"),
                )
              }
              className={cn(buttonVariants(), "mt-auto w-full")}>
              <GameControllerIcon />
              {server.players >= server.max
                ? t("servers.full")
                : t("servers.join")}
            </button>
          </aside>
        )}
      </div>
    </div>
  );
};
