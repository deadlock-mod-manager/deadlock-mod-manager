import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowUpToLine,
  Box,
  Check,
  ChevronDown,
  EllipsisVertical,
  EyeOff,
  File,
  Image,
} from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { ConflictGroup } from "@/lib/mods/conflicts";
import type { ConflictIgnoreAction } from "@/types/generated/ConflictIgnoreAction";
import type { ConflictSeverity } from "@/types/generated/ConflictSeverity";
import type { LocalMod } from "@/types/mods";

const SEVERITY_ICON = {
  critical: Box,
  normal: Image,
  low: File,
} satisfies Record<ConflictSeverity, typeof Box>;

const SEVERITY_TILE = {
  critical: "bg-destructive/15 text-red-300",
  normal: "bg-amber-500/10 text-amber-300",
  low: "bg-muted text-muted-foreground",
} satisfies Record<ConflictSeverity, string>;

export const modDisplayName = (
  modsById: ReadonlyMap<string, LocalMod>,
  remoteId: string,
) => modsById.get(remoteId)?.name ?? remoteId;

const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const directoryOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

const ProviderRow = ({
  mod,
  name,
  position,
  severity,
  modId,
  onLoadFirst,
  isBusy,
}: {
  mod: LocalMod | undefined;
  name: string;
  position: number;
  severity: ConflictSeverity;
  modId: string;
  onLoadFirst: () => void;
  isBusy: boolean;
}) => {
  const { t } = useTranslation();
  const isUsed = position === 0;
  return (
    <li
      className='flex items-center gap-3 py-1.5'
      data-mod-id={modId}
      data-testid='conflict-provider'>
      <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 font-medium text-primary text-xs tabular-nums'>
        {position + 1}
      </span>
      <Link
        className='group/mod mr-auto flex min-w-0 items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
        state={{ collection: "library" }}
        title={name}
        to={`/mods/${modId}`}>
        <div className='h-7 w-7 shrink-0 overflow-hidden rounded bg-secondary'>
          {mod?.images?.[0] && (
            <img
              alt=''
              className='h-full w-full object-cover'
              src={mod.images[0]}
            />
          )}
        </div>
        <span
          className={cn(
            "min-w-0 truncate text-sm group-hover/mod:underline",
            !isUsed && "text-muted-foreground",
          )}>
          {name}
        </span>
      </Link>
      {isUsed ? (
        <span className='flex shrink-0 items-center gap-1 text-primary text-xs'>
          <Check aria-hidden className='h-3.5 w-3.5' />
          {t("conflicts.used")}
        </span>
      ) : (
        <>
          <span
            className={cn(
              "shrink-0 text-xs",
              severity === "critical"
                ? "text-red-300"
                : "text-muted-foreground",
            )}>
            {severity === "critical"
              ? t("conflicts.modelHidden")
              : t("conflicts.usingFirstCopy")}
          </span>
          <Button
            disabled={isBusy}
            icon={<ArrowUpToLine className='h-3.5 w-3.5' />}
            onClick={onLoadFirst}
            size='sm'
            variant={severity === "critical" ? "outline" : "ghost"}>
            {t("conflicts.loadFirst")}
          </Button>
        </>
      )}
    </li>
  );
};

interface ConflictGroupRowProps {
  group: ConflictGroup;
  modsById: ReadonlyMap<string, LocalMod>;
  onIgnore: (actions: ConflictIgnoreAction[]) => void;
  onLoadFirst: (modId: string, currentFirst: string) => void;
  isBusy: boolean;
}

export const ConflictGroupRow = ({
  group,
  modsById,
  onIgnore,
  onLoadFirst,
  isBusy,
}: ConflictGroupRowProps) => {
  const { t } = useTranslation();
  const Icon = SEVERITY_ICON[group.severity];
  const [first] = group.providers;
  const preview = group.files.slice(0, 2).map((file) => fileName(file.path));
  const hiddenCount = group.files.length - preview.length;
  const isCritical = group.severity === "critical";
  const markFine = () =>
    onIgnore(
      group.pairs.map(([modA, modB]) => ({ type: "ignorePair", modA, modB })),
    );

  return (
    <div
      className='rounded-lg border bg-card/60'
      data-providers={group.providers.join(",")}
      data-severity={group.severity}
      data-testid='conflict-group'>
      <div className='flex items-start gap-3 px-4 pt-3'>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            SEVERITY_TILE[group.severity],
          )}>
          <Icon aria-hidden className='h-4 w-4' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='font-medium text-sm'>
            {t(`conflicts.title.${group.severity}`, {
              count: group.providers.length,
            })}
            {!isCritical && (
              <span className='ml-2 font-normal text-muted-foreground'>
                {t(`conflicts.hint.${group.severity}`)}
              </span>
            )}
          </p>
          <p className='truncate font-mono text-muted-foreground text-xs'>
            {preview.join(", ")}
            {hiddenCount > 0 &&
              ` ${t("conflicts.moreFiles", { count: hiddenCount })}`}
          </p>
        </div>
        {!isCritical && (
          <Button
            disabled={isBusy}
            icon={<Check className='h-3.5 w-3.5' />}
            onClick={markFine}
            size='sm'
            variant='outline'>
            {t("conflicts.markFine")}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("conflicts.options")}
              disabled={isBusy}
              icon={<EllipsisVertical className='h-4 w-4' />}
              size='icon'
              variant='ghost'
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {isCritical && (
              <>
                <DropdownMenuItem onClick={markFine}>
                  {t("conflicts.markFine")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {group.providers.map((modId) => (
              <DropdownMenuItem
                key={modId}
                onClick={() => onIgnore([{ type: "ignoreMod", modId }])}>
                {t("conflicts.ignoreMod", {
                  mod: modDisplayName(modsById, modId),
                })}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ol className='px-4 pt-2 pb-1'>
        {group.providers.map((modId, position) => (
          <ProviderRow
            isBusy={isBusy}
            key={modId}
            mod={modsById.get(modId)}
            modId={modId}
            name={modDisplayName(modsById, modId)}
            onLoadFirst={() => onLoadFirst(modId, first)}
            position={position}
            severity={group.severity}
          />
        ))}
      </ol>

      <Collapsible className='border-t'>
        <CollapsibleTrigger
          className='group flex w-full items-center gap-1.5 rounded-b-lg px-4 py-2 text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60'
          data-testid='conflict-files-toggle'>
          <ChevronDown
            aria-hidden
            className='h-3.5 w-3.5 transition-transform group-data-[state=closed]:-rotate-90'
          />
          {t("conflicts.showFiles", { count: group.files.length })}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ul className='max-h-56 overflow-y-auto px-4 pb-3'>
            {group.files.map((file) => (
              <li
                className='group/file flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40'
                data-path={file.path}
                data-testid='conflict-file'
                key={file.path}>
                <code
                  className='min-w-0 flex-1 truncate text-xs'
                  title={file.path}>
                  <span className='text-muted-foreground'>
                    {directoryOf(file.path)}
                  </span>
                  {fileName(file.path)}
                </code>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={t("conflicts.ignoreFile")}
                      className='h-6 w-6 opacity-0 focus-visible:opacity-100 group-hover/file:opacity-100'
                      disabled={isBusy}
                      icon={<EyeOff className='h-3.5 w-3.5' />}
                      onClick={() =>
                        onIgnore(
                          group.pairs.map(([modA, modB]) => ({
                            type: "ignorePairFile",
                            modA,
                            modB,
                            path: file.path,
                          })),
                        )
                      }
                      size='icon'
                      variant='ghost'
                    />
                  </TooltipTrigger>
                  <TooltipContent>{t("conflicts.ignoreFile")}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
