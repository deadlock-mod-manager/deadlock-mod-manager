import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  LightningIcon,
  LockKeyIcon,
  LockKeyOpenIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { modeTone } from "../mode-tones";
import { FlagGlyph } from "../region-flag";
import FilterChip from "./filter-chip";
import { formatModeLabel } from "./region-grouping";
import type { ServerFiltersValue } from "./types";

interface ActiveFilterChipsProps {
  value: ServerFiltersValue;
  isJoinable: boolean;
  activeAxisCount: number;
  total: number;
  onUpdate: (patch: Partial<ServerFiltersValue>) => void;
  onClearAll: () => void;
}

const ActiveFilterChips = ({
  value,
  isJoinable,
  activeAxisCount,
  total,
  onUpdate,
  onClearAll,
}: ActiveFilterChipsProps) => {
  const { t } = useTranslation();
  const removeLabel = t("servers.filters.chip.remove");

  return (
    <div className='flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2'>
      <span className='text-[11px] font-medium text-muted-foreground'>
        {t("servers.filters.activeFilters")}
      </span>

      {value.search && (
        <FilterChip
          label={t("servers.filters.chip.search")}
          onRemove={() => onUpdate({ search: "" })}
          removeLabel={removeLabel}
          value={<span className='max-w-[200px] truncate'>{value.search}</span>}
        />
      )}

      {isJoinable ? (
        <FilterChip
          accent='primary'
          label={t("servers.filters.chip.preset")}
          onRemove={() => onUpdate({ password: "all", hasPlayers: false })}
          removeLabel={removeLabel}
          value={
            <span className='inline-flex items-center gap-1'>
              <LightningIcon className='size-3' weight='fill' />
              {t("servers.filters.chip.joinable")}
            </span>
          }
        />
      ) : (
        <>
          {value.password === "open" && (
            <FilterChip
              label={t("servers.filters.chip.status")}
              onRemove={() => onUpdate({ password: "all" })}
              removeLabel={removeLabel}
              value={
                <span className='inline-flex items-center gap-1'>
                  <LockKeyOpenIcon className='size-3' />
                  {t("servers.filters.chip.open")}
                </span>
              }
            />
          )}
          {value.password === "password" && (
            <FilterChip
              label={t("servers.filters.chip.status")}
              onRemove={() => onUpdate({ password: "all" })}
              removeLabel={removeLabel}
              value={
                <span className='inline-flex items-center gap-1'>
                  <LockKeyIcon className='size-3' weight='fill' />
                  {t("servers.filters.chip.password")}
                </span>
              }
            />
          )}
          {value.hasPlayers && (
            <FilterChip
              label={t("servers.filters.chip.players")}
              onRemove={() => onUpdate({ hasPlayers: false })}
              removeLabel={removeLabel}
              value={
                <span className='inline-flex items-center gap-1'>
                  <UsersThreeIcon className='size-3' weight='fill' />
                  {t("servers.filters.chip.withPlayers")}
                </span>
              }
            />
          )}
        </>
      )}

      {value.gameMode && (
        <FilterChip
          label={t("servers.filters.chip.mode")}
          onRemove={() => onUpdate({ gameMode: "" })}
          removeLabel={removeLabel}
          value={
            <span className='inline-flex items-center gap-1.5'>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  modeTone(value.gameMode)?.dot ?? "bg-muted",
                )}
              />
              <span>{formatModeLabel(value.gameMode)}</span>
            </span>
          }
        />
      )}

      {value.region && (
        <FilterChip
          label={t("servers.filters.chip.region")}
          onRemove={() => onUpdate({ region: "" })}
          removeLabel={removeLabel}
          value={
            <span className='inline-flex items-center gap-1.5'>
              <FlagGlyph className='size-3' region={value.region} />
              <span className='text-xs font-medium'>
                {value.region.toUpperCase()}
              </span>
            </span>
          }
        />
      )}

      <div className='ml-auto flex items-center gap-1.5'>
        <Badge
          className='h-5 border-border/60 bg-background/60 px-2 text-[11px] font-medium text-muted-foreground'
          variant='outline'>
          {t("servers.filters.count", { count: total })}
        </Badge>
        <Button
          className='h-6 gap-1 px-2 text-[11px] font-medium'
          onClick={onClearAll}
          size='sm'
          variant='ghost'>
          <XIcon className='size-3' weight='bold' />
          {t("servers.filters.clearN", { count: activeAxisCount })}
        </Button>
      </div>
    </div>
  );
};

export default ActiveFilterChips;
