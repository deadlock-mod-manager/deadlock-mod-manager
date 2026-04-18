import { TooltipProvider } from "@deadlock-mods/ui/components/tooltip";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import ActiveFilterChips from "./filters/active-filter-chips";
import GameModeSelect from "./filters/game-mode-select";
import JoinableToggle from "./filters/joinable-toggle";
import PasswordSegment from "./filters/password-segment";
import {
  CONTINENT_ORDER,
  type ContinentKey,
  continentOf,
} from "./filters/region-grouping";
import RefreshButton from "./filters/refresh-button";
import RegionSelect from "./filters/region-select";
import SearchInput from "./filters/search-input";
import {
  EMPTY_FILTERS,
  type PasswordFilter,
  type ServerFiltersProps,
  type ServerFiltersValue,
} from "./filters/types";
import WithPlayersToggle from "./filters/with-players-toggle";

export type { PasswordFilter, ServerFiltersValue, ServerFiltersProps };

const ServerFilters = ({
  value,
  onChange,
  availableGameModes,
  availableRegions,
  total,
  isFetching = false,
  onRefresh,
}: ServerFiltersProps) => {
  const update = (patch: Partial<ServerFiltersValue>) => {
    onChange({ ...value, ...patch });
  };

  const clearAll = () => {
    onChange(EMPTY_FILTERS);
  };

  const isJoinable = value.password === "open" && value.hasPlayers === true;

  const toggleJoinable = () => {
    if (isJoinable) {
      update({ password: "all", hasPlayers: false });
    } else {
      update({ password: "open", hasPlayers: true });
    }
  };

  const activeAxisCount =
    (value.search ? 1 : 0) +
    (value.gameMode ? 1 : 0) +
    (value.region ? 1 : 0) +
    (isJoinable
      ? 1
      : (value.hasPlayers ? 1 : 0) + (value.password !== "all" ? 1 : 0));

  const isFiltered = activeAxisCount > 0;

  const groupedRegions = useMemo(() => {
    const groups = new Map<ContinentKey, string[]>();
    for (const region of availableRegions) {
      const key = continentOf(region);
      const list = groups.get(key) ?? [];
      list.push(region);
      groups.set(key, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.localeCompare(b));
    }
    return CONTINENT_ORDER.filter((k) => groups.has(k)).map(
      (key) => [key, groups.get(key) ?? []] as const,
    );
  }, [availableRegions]);

  const sortedGameModes = useMemo(
    () => [...availableGameModes].sort((a, b) => a.localeCompare(b)),
    [availableGameModes],
  );

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-card/40",
          "shadow-[0_1px_0_rgb(255_255_255/0.04)_inset]",
        )}>
        <div className='flex flex-wrap items-center gap-1.5 p-1.5'>
          <JoinableToggle isJoinable={isJoinable} onToggle={toggleJoinable} />

          <SearchInput
            isFetching={isFetching}
            onChange={(search) => update({ search })}
            total={total}
            value={value.search}
          />

          <span aria-hidden className='hidden h-6 w-px bg-border/60 sm:block' />

          <PasswordSegment
            onChange={(password) => update({ password })}
            value={value.password}
          />

          <WithPlayersToggle
            onPressedChange={(hasPlayers) => update({ hasPlayers })}
            pressed={value.hasPlayers}
          />

          <GameModeSelect
            modes={sortedGameModes}
            onChange={(gameMode) => update({ gameMode })}
            value={value.gameMode}
          />

          <RegionSelect
            groupedRegions={groupedRegions}
            onChange={(region) => update({ region })}
            value={value.region}
          />

          <div className='ml-auto flex items-center gap-1'>
            <span
              aria-hidden
              className='hidden h-6 w-px bg-border/60 sm:block'
            />
            {onRefresh && (
              <RefreshButton isFetching={isFetching} onClick={onRefresh} />
            )}
          </div>
        </div>

        {isFiltered && (
          <ActiveFilterChips
            activeAxisCount={activeAxisCount}
            isJoinable={isJoinable}
            onClearAll={clearAll}
            onUpdate={update}
            total={total}
            value={value}
          />
        )}
      </div>
    </TooltipProvider>
  );
};

export default ServerFilters;
