import { AudioLines, Box, Image } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";

const SOURCE_STYLE = {
  1: "border-primary/50 bg-primary/15 text-primary",
  2: "border-sky-400/50 bg-sky-400/15 text-sky-300",
};
const SKIPPED =
  "border-dashed border-border text-muted-foreground/60 line-through";

type Cell = { source: 1 | 2; skipped?: boolean } | null;

const ASSETS = [
  { key: "hat", icon: Box },
  { key: "coat", icon: Image },
  { key: "footsteps", icon: AudioLines },
] satisfies { key: string; icon: typeof Box }[];

const ROWS = [
  { label: "first", cells: [{ source: 1 }, { source: 1 }, null] },
  {
    label: "second",
    cells: [{ source: 2, skipped: true }, null, { source: 2 }],
  },
  { label: "inGame", cells: [{ source: 1 }, { source: 1 }, { source: 2 }] },
] satisfies { label: "first" | "second" | "inGame"; cells: Cell[] }[];

const Chip = ({ cell }: { cell: Cell }) => {
  const { t } = useTranslation();
  if (!cell) {
    return <span className='text-center text-muted-foreground/40'>—</span>;
  }
  return (
    <span
      className={cn(
        "rounded border px-2 py-1 text-center text-xs",
        cell.skipped ? SKIPPED : SOURCE_STYLE[cell.source],
      )}>
      {cell.skipped
        ? t("conflicts.help.skipped")
        : t("conflicts.help.fromMod", { position: cell.source })}
    </span>
  );
};

export const LoadOrderHelp = () => {
  const { t } = useTranslation();
  return (
    <div
      className='grid gap-5 rounded-lg border bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]'
      data-testid='load-order-help'>
      <div
        aria-hidden
        className='grid grid-cols-[auto_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-2 self-center'>
        <span />
        {ASSETS.map(({ key, icon: Icon }) => (
          <span
            className='flex items-center justify-center gap-1.5 text-muted-foreground text-xs'
            key={key}>
            <Icon className='h-3.5 w-3.5' />
            {t(`conflicts.help.assets.${key}`)}
          </span>
        ))}
        {ROWS.map(({ label, cells }) => (
          <div className='contents' key={label}>
            <span
              className={cn(
                "flex items-center gap-2 pr-2 text-xs",
                label === "inGame"
                  ? "border-t pt-2 font-medium"
                  : "text-muted-foreground",
              )}>
              {label !== "inGame" && (
                <span className='flex h-5 w-5 items-center justify-center rounded bg-primary/10 font-medium text-primary tabular-nums'>
                  {label === "first" ? 1 : 2}
                </span>
              )}
              {t(`conflicts.help.rows.${label}`)}
            </span>
            {cells.map((cell, index) => (
              <div
                className={cn("grid", label === "inGame" && "border-t pt-2")}
                key={ASSETS[index].key}>
                <Chip cell={cell} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className='space-y-2 text-muted-foreground text-sm'>
        <p>{t("conflicts.help.order")}</p>
        <p>{t("conflicts.help.models")}</p>
        <p>{t("conflicts.help.action")}</p>
      </div>
    </div>
  );
};
