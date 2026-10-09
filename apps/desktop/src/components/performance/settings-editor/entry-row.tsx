import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowCounterClockwiseIcon,
  DotsThreeVerticalIcon,
  EyeIcon,
  InfoIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import { memo, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  actionForValue,
  type DraftAction,
} from "@/lib/performance/editor/draft";
import { isEngineSectionEntry, isInert } from "@/lib/performance/editor/filter";
import {
  describeValue,
  entryKeyLabel,
  sameValue,
} from "@/lib/performance/editor/values";
import { isDevtoolEnabled } from "@/lib/performance/overrides";
import { cn } from "@/lib/utils";
import type { ConvarMeta } from "@/types/generated/ConvarMeta";
import type { EntryOverride } from "@/types/generated/EntryOverride";
import type { ResolvedEntry } from "@/types/generated/ResolvedEntry";
import { EntryControl } from "./entry-control";
import { EntryNotes } from "./entry-notes";

export const ENTRY_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_15rem_4.5rem] gap-x-5";

export const entryDomId = (key: string) => `perf-entry-${key}`;

type EntryRowProps = {
  entry: ResolvedEntry;
  entryKey: string;
  override: EntryOverride | undefined;
  showKey: boolean;
  /** The draft includes engine-section edits (may run ahead of `entry.status`). */
  engineIncluded: boolean;
  highlighted: boolean;
  onAction: (action: DraftAction) => void;
};

const ReferenceValue = ({
  value,
  meta,
}: {
  value: string;
  meta: ConvarMeta | null;
}) => {
  const { t } = useTranslation();
  const display = describeValue(value, meta);
  const text =
    display.kind === "bool"
      ? t(
          display.on
            ? "performance.editor.row.on"
            : "performance.editor.row.off",
        )
      : display.kind === "enum"
        ? display.label
        : display.text;
  return (
    <span className='truncate text-foreground/80' title={value}>
      {text === "" ? '""' : text}
    </span>
  );
};

const EntryRowComponent = ({
  entry,
  entryKey,
  override,
  showKey,
  engineIncluded,
  highlighted,
  onAction,
}: EntryRowProps) => {
  const { t } = useTranslation();
  const { meta, path } = entry;
  const rawKey = entryKeyLabel(path);
  const name = meta?.label ?? rawKey;
  const overrideKind = override?.action.kind;
  const help = meta?.description ?? meta?.help;

  const inert = isInert(entry);
  const engineLocked = isEngineSectionEntry(entry) && !engineIncluded;
  const isDevtools = entry.gameplay === "devtools";
  const devtoolsEnabled = isDevtoolEnabled(override);
  const omittedByUser = overrideKind === "omit";
  const isAuthorView =
    entry.gameplay === "camera" || entry.gameplay === "visibility";
  const commentedOut =
    entry.inConfig &&
    entry.configValue === null &&
    overrideKind !== "set" &&
    !omittedByUser;

  const value =
    override?.action.kind === "set"
      ? override.action.value
      : (entry.configValue ?? entry.value);
  const kind = meta?.kind ?? null;
  const gameValue = entry.liveValue ?? meta?.default ?? null;
  const gameReference =
    gameValue !== null && (value === null || !sameValue(value, gameValue, kind))
      ? gameValue
      : null;
  const configReference =
    override?.action.kind === "set" &&
    entry.configValue !== null &&
    !sameValue(entry.configValue, override.action.value, kind)
      ? entry.configValue
      : null;

  const controlDisabled =
    inert ||
    engineLocked ||
    omittedByUser ||
    commentedOut ||
    (isDevtools && !devtoolsEnabled);
  const canTurnOff =
    !inert && !omittedByUser && !(isDevtools && !devtoolsEnabled);

  const commitValue = (next: string) =>
    onAction(
      actionForValue(
        {
          path,
          configValue: entry.configValue,
          kind,
          offByDefault: isDevtools,
        },
        next,
      ),
    );
  const reset = () => onAction({ kind: "reset", path });
  const omit = () => onAction({ kind: "omit", path });

  return (
    <div
      className={cn(
        ENTRY_ROW_GRID,
        "group/row relative scroll-mt-24 items-start border-border/40 border-b px-4 py-3 transition-colors last:border-b-0",
        highlighted && "bg-primary/10",
      )}
      id={entryDomId(entryKey)}>
      {override && (
        <span className='absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary' />
      )}

      <div className='min-w-0 space-y-1'>
        <div
          className={cn("space-y-1", (inert || omittedByUser) && "opacity-60")}>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span
              className={cn(
                "font-medium text-sm",
                !meta?.label && "break-all font-mono",
                entry.status === "blocked" && "line-through",
              )}>
              {name}
            </span>
            {showKey && name !== rawKey && (
              <code className='break-all font-mono text-muted-foreground text-xs'>
                {rawKey}
              </code>
            )}
            {entry.status !== "applies" && (
              <Badge
                className='px-1.5 py-0 font-normal text-[11px] text-muted-foreground'
                variant='outline'>
                {t(`performance.status.${entry.status}`)}
              </Badge>
            )}
            {entry.gameplay && (
              <Badge
                className='px-1.5 py-0 font-normal text-[11px] text-muted-foreground'
                variant='outline'>
                {t(`performance.editor.row.gameplay.${entry.gameplay}`)}
              </Badge>
            )}
          </div>
          {help && (
            <p className='line-clamp-1 text-muted-foreground text-xs leading-relaxed group-focus-within/row:line-clamp-none group-hover/row:line-clamp-none'>
              {help}
            </p>
          )}
          {meta?.sideEffects && (
            <p className='flex items-start gap-1.5 text-muted-foreground text-xs'>
              <InfoIcon className='mt-0.5 size-3.5 shrink-0' />
              <span>
                {t("performance.editor.row.sideEffect", {
                  text: meta.sideEffects,
                })}
              </span>
            </p>
          )}
          <EntryNotes entry={entry} />
        </div>

        {omittedByUser && (
          <p className='flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs'>
            {t("performance.editor.row.turnedOff")}
            <Button
              className='h-auto p-0 text-xs'
              onClick={reset}
              size='text'
              variant='link'>
              {t("performance.editor.row.restore")}
            </Button>
          </p>
        )}
        {isAuthorView && !omittedByUser && !inert && (
          <p className='flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs'>
            <EyeIcon className='size-3.5 shrink-0' />
            {t("performance.editor.row.fromAuthor")}
            <Button
              className='h-auto p-0 text-xs'
              onClick={omit}
              size='text'
              variant='link'>
              {t("performance.editor.row.turnOffInline")}
            </Button>
          </p>
        )}
        {isDevtools && !omittedByUser && !inert && (
          <div className='flex items-center gap-2 text-muted-foreground text-xs'>
            <WrenchIcon className='size-3.5 shrink-0' />
            <span>
              {devtoolsEnabled
                ? t("performance.editor.row.devtoolsOn")
                : t("performance.editor.row.devtoolsOff")}
            </span>
            <Switch
              aria-label={t("performance.editor.row.enable", { name })}
              checked={devtoolsEnabled}
              className='scale-75'
              onCheckedChange={(checked) =>
                onAction(
                  checked ? { kind: "enable", path } : { kind: "reset", path },
                )
              }
            />
          </div>
        )}
      </div>

      <div className='space-y-1 pt-0.5'>
        {value === null ? (
          <div className='flex flex-col items-start gap-0.5 text-sm'>
            <span className='text-muted-foreground italic'>
              {omittedByUser
                ? t("performance.status.omitted")
                : t("performance.editor.row.commentedOutByConfig")}
            </span>
            {commentedOut && !inert && (
              <Button
                className='h-auto p-0 text-xs'
                onClick={omit}
                size='text'
                variant='link'>
                {t("performance.editor.row.keepGameLine")}
              </Button>
            )}
          </div>
        ) : (
          <div className={cn(controlDisabled && "opacity-60")}>
            <EntryControl
              disabled={controlDisabled}
              label={t("performance.editor.row.valueLabel", { name })}
              meta={meta}
              onCommit={commitValue}
              styleOf={entry.configValue}
              value={value}
            />
          </div>
        )}
        {(gameReference !== null || configReference !== null) && (
          <p className='flex flex-wrap gap-x-3 text-muted-foreground text-xs'>
            {gameReference !== null && (
              <span className='flex min-w-0 gap-1'>
                {t("performance.editor.row.gameValue")}
                <ReferenceValue meta={meta} value={gameReference} />
              </span>
            )}
            {configReference !== null && (
              <span className='flex min-w-0 gap-1'>
                {t("performance.editor.row.configValue")}
                <ReferenceValue meta={meta} value={configReference} />
              </span>
            )}
          </p>
        )}
      </div>

      <div className='flex items-start justify-end gap-0.5'>
        {override && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("performance.editor.row.undoChange")}
                className='size-7'
                onClick={reset}
                size='icon'
                variant='ghost'>
                <ArrowCounterClockwiseIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("performance.editor.row.undoChange")}
            </TooltipContent>
          </Tooltip>
        )}
        {(canTurnOff || override) && (
          <RowMenu label={t("performance.editor.row.menu", { name })}>
            {canTurnOff && (
              <DropdownMenuItem onSelect={omit}>
                {t("performance.editor.row.turnOff")}
              </DropdownMenuItem>
            )}
            {override && (
              <DropdownMenuItem onSelect={reset}>
                {omittedByUser
                  ? t("performance.editor.row.restore")
                  : t("performance.editor.row.undoChange")}
              </DropdownMenuItem>
            )}
          </RowMenu>
        )}
      </div>
    </div>
  );
};

/**
 * The row's "⋯" menu. A config shows hundreds of rows, so the menu itself is
 * only mounted the first time the button is used.
 */
const RowMenu = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => {
  const [mounted, setMounted] = useState(false);
  const trigger = (
    <Button
      aria-label={label}
      className='size-7'
      onKeyDown={(event) => {
        if (["Enter", " ", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          setMounted(true);
        }
      }}
      onPointerDown={(event) => {
        if (event.button === 0) setMounted(true);
      }}
      size='icon'
      variant='ghost'>
      <DotsThreeVerticalIcon />
    </Button>
  );
  if (!mounted) return trigger;
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align='end'>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
};

export const EntryRow = memo(EntryRowComponent);
