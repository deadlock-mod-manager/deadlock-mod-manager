import { Button } from "@deadlock-mods/ui/components/button";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  GlobeHemisphereWestIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LocationGroup } from "@/components/server-picker/location-group";
import { PickerActionBar } from "@/components/server-picker/picker-action-bar";
import { PickerPresets } from "@/components/server-picker/picker-presets";
import { PickerStatus } from "@/components/server-picker/picker-status";
import {
  PickerToolbar,
  type PickerFilters,
} from "@/components/server-picker/picker-toolbar";
import PageTitle from "@/components/shared/page-title";
import { useGameRunning } from "@/hooks/use-mod-health";
import { useRecentServerMatches } from "@/hooks/use-recent-server-matches";
import { useServerPicker } from "@/hooks/use-server-picker";
import { getErrorMessage } from "@/lib/errors";
import {
  changeBlockedLocations,
  countPickerChanges,
  fastestAllowedLocation,
  groupPickerLocations,
  pickerLocationRange,
} from "@/lib/server-picker";
import type { ServerPickerLatency } from "@/types/generated/ServerPickerLatency";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";
import { isTauriError } from "@/types/tauri";

const EMPTY_LOCATIONS: ServerPickerLocation[] = [];
const EMPTY_LATENCIES: ServerPickerLatency[] = [];
const EMPTY_IDS: string[] = [];

const ServerPickerPage = () => {
  const { t } = useTranslation();
  const picker = useServerPicker();
  const gameRunning = useGameRunning();
  const state = picker.query.data;
  const [draft, setDraft] = useState<string[] | null>(null);
  const [filters, setFilters] = useState<PickerFilters>({
    search: "",
    region: "all",
    sort: "name",
  });
  const search = useDeferredValue(filters.search);
  const locations = state?.catalog?.locations ?? EMPTY_LOCATIONS;
  const latencies = state?.latencies ?? EMPTY_LATENCIES;
  const baseline = state?.blockedLocations ?? EMPTY_IDS;
  const selected = draft ?? baseline;
  const changes = countPickerChanges(baseline, selected);
  const disabled =
    picker.isWriting || !state?.capability.supported || !state.catalog;
  const groups = useMemo(
    () =>
      groupPickerLocations(
        locations,
        search,
        filters.region,
        filters.sort,
        latencies,
      ),
    [locations, search, filters.region, filters.sort, latencies],
  );
  const regions = useMemo(
    () => [...new Set(locations.map((location) => location.region))].sort(),
    [locations],
  );
  const recentMatches = useRecentServerMatches(locations);
  const playedPreset = useMemo(
    () =>
      recentMatches?.size
        ? locations
            .filter((location) => !recentMatches.has(location.id))
            .map((location) => location.id)
            .sort()
        : null,
    [locations, recentMatches],
  );
  const blocked = useMemo(() => new Set(selected), [selected]);
  const original = useMemo(() => new Set(baseline), [baseline]);
  const observed = state?.observationKnown
    ? new Set(state.observedBlockedLocations)
    : null;
  const timings = useMemo(
    () => new Map(latencies.map((latency) => [latency.locationId, latency])),
    [latencies],
  );
  const probeError =
    isTauriError(picker.probe.error) &&
    picker.probe.error.serverPickerKind === "cancelled"
      ? null
      : picker.probe.error;
  const failure =
    picker.apply.error ??
    picker.restore.error ??
    picker.refresh.error ??
    picker.savePreset.error ??
    picker.deletePreset.error ??
    probeError ??
    picker.cancelProbe.error ??
    picker.query.error;
  const needsReconcile =
    state?.capability.supported &&
    (!state.observationKnown || !state.rulesMatch);
  const fastest = useMemo(
    () => fastestAllowedLocation(locations, blocked, latencies),
    [locations, blocked, latencies],
  );
  const measuredAt = latencies.reduce<number | null>(
    (latest, latency) =>
      !latest || latency.measuredAt > latest ? latency.measuredAt : latest,
    null,
  );
  // Last clicked row; shift-click applies the same state to every visible
  // row between it and the clicked one.
  const anchor = useRef<string | null>(null);
  const changeLocations = (ids: string[], value: boolean) =>
    setDraft((current) =>
      changeBlockedLocations(current ?? baseline, ids, value),
    );
  const toggleLocation = (id: string, value: boolean, extend: boolean) => {
    const ids =
      extend && anchor.current
        ? pickerLocationRange(
            groups.flatMap((group) =>
              group.locations.map((location) => location.id),
            ),
            anchor.current,
            id,
          )
        : [id];
    anchor.current = id;
    changeLocations(ids, value);
  };

  return (
    <div className='flex h-full w-full min-w-0 flex-col gap-3 overflow-hidden pb-3 pl-4 pr-3'>
      <header className='flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-1'>
        <PageTitle
          className='pt-3'
          title={t("serverPicker.title")}
          subtitle={t("serverPicker.subtitle")}
        />
        <div className='pt-3'>
          <PickerStatus
            state={state}
            busy={picker.isWriting}
            restoring={picker.restore.isPending}
            fastest={fastest}
            refreshing={picker.refresh.isPending}
            canRefresh={!picker.isWriting && !picker.probe.isPending}
            onRefresh={() => {
              picker.clearErrors();
              picker.refresh.mutate();
            }}
            onRestore={() => {
              picker.clearErrors();
              picker.restore.mutate(undefined, {
                onSuccess: (result) => {
                  if (result.observationKnown && result.rulesMatch)
                    setDraft(null);
                },
              });
            }}
          />
        </div>
      </header>
      <PickerToolbar
        filters={filters}
        regions={regions}
        onChange={setFilters}
        probing={picker.probe.isPending}
        disabled={picker.isWriting}
        canProbe={locations.length > 0 && !picker.refresh.isPending}
        measuredAt={measuredAt}
        onProbe={() => {
          picker.clearErrors();
          picker.probe.mutate();
        }}
        onCancelProbe={() => picker.cancelProbe.mutate()}
      />
      <div className='shrink-0 border-b border-border/60 pb-3'>
        <PickerPresets
          presets={state?.presets ?? []}
          blockedLocations={selected}
          appliedLocations={
            state?.observationKnown && state.rulesMatch ? baseline : null
          }
          playedPreset={playedPreset}
          disabled={
            !state ||
            picker.savePreset.isPending ||
            picker.deletePreset.isPending
          }
          loadDisabled={disabled}
          saving={picker.savePreset.isPending}
          onLoad={(ids) => {
            picker.clearErrors();
            setDraft([...ids]);
          }}
          onDelete={(id) => {
            picker.clearErrors();
            picker.deletePreset.mutate(id);
          }}
          onSave={(name, onSaved) => {
            picker.clearErrors();
            picker.savePreset.mutate(
              { name, blockedLocations: selected },
              {
                onSuccess: onSaved,
              },
            );
          }}
        />
      </div>
      {failure && (
        <div
          role='alert'
          className='flex shrink-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 py-2 pl-3 pr-1 text-xs'>
          <WarningCircleIcon
            aria-hidden
            className='mt-0.5 size-4 shrink-0 text-destructive'
          />
          <p className='min-w-0 flex-1 break-words py-0.5'>
            {getErrorMessage(failure)}
          </p>
          {!picker.query.error && (
            <Button
              className='size-6 shrink-0'
              size='icon'
              variant='ghost'
              aria-label={t("serverPicker.dismiss")}
              onClick={picker.clearErrors}>
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
      )}
      {state && !state.capability.supported ? (
        <p role='status' className='text-xs text-muted-foreground'>
          {state.capability.reason ?? t("serverPicker.unsupportedDescription")}
        </p>
      ) : state?.warning ? (
        <details className='shrink-0 text-xs text-muted-foreground'>
          <summary className='cursor-pointer'>
            {t("serverPicker.reviewStatus")}
          </summary>
          <p className='pt-2'>{state.warning}</p>
        </details>
      ) : null}
      {state?.capability.scope === "system" && (
        <p className='text-xs text-muted-foreground'>
          {t("serverPicker.systemScopeShort")}
        </p>
      )}
      <div className='min-h-0 flex-1 space-y-3 overflow-y-auto pr-1'>
        <p className='text-[11px] text-muted-foreground'>
          {t("serverPicker.locationCount", {
            count: groups.reduce(
              (total, group) => total + group.locations.length,
              0,
            ),
          })}
        </p>
        {picker.query.isPending && (
          <div className='space-y-2' aria-label={t("serverPicker.loading")}>
            <Skeleton className='h-12' />
            <Skeleton className='h-12' />
            <Skeleton className='h-12' />
          </div>
        )}
        {!picker.query.isPending && groups.length === 0 && (
          <div className='flex flex-col items-center gap-3 py-16 text-center'>
            <GlobeHemisphereWestIcon
              aria-hidden
              className='size-8 text-muted-foreground'
            />
            <p className='text-sm text-muted-foreground'>
              {t(
                locations.length
                  ? "serverPicker.noMatches"
                  : "serverPicker.noCatalog",
              )}
            </p>
            <Button
              variant='outline'
              size='sm'
              isLoading={picker.refresh.isPending}
              onClick={() =>
                locations.length
                  ? setFilters({ ...filters, search: "", region: "all" })
                  : picker.refresh.mutate()
              }>
              {t(
                locations.length
                  ? "serverPicker.clearFilters"
                  : "serverPicker.refresh",
              )}
            </Button>
          </div>
        )}
        <div className='columns-1 gap-6 xl:columns-2'>
          {groups.map((group) => (
            <LocationGroup
              key={group.region}
              region={group.region}
              locations={group.locations}
              blocked={blocked}
              baseline={original}
              observed={observed}
              latencies={timings}
              matches={recentMatches}
              disabled={disabled}
              onChange={changeLocations}
              onToggle={toggleLocation}
            />
          ))}
        </div>
      </div>
      {changes > 0 || needsReconcile ? (
        <PickerActionBar
          changes={changes}
          dirty={draft !== null}
          blockedCount={
            locations.filter((location) => blocked.has(location.id)).length
          }
          totalCount={locations.length}
          disabled={disabled || picker.refresh.isPending}
          applying={picker.apply.isPending}
          gameRunning={gameRunning}
          onDiscard={() => setDraft(null)}
          onApply={() => {
            picker.clearErrors();
            picker.apply.mutate(selected, {
              onSuccess: (result) => {
                if (result.observationKnown && result.rulesMatch)
                  setDraft(null);
              },
            });
          }}
        />
      ) : null}
    </div>
  );
};

export default ServerPickerPage;
