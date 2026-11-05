import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { PICKER_REGION_KEYS } from "@/lib/server-picker";
import { cn } from "@/lib/utils";
import type { ServerPickerLatency } from "@/types/generated/ServerPickerLatency";
import type { ServerPickerLocation } from "@/types/generated/ServerPickerLocation";
import { LocationRow } from "./location-row";

interface LocationGroupProps {
  region: string;
  locations: ServerPickerLocation[];
  blocked: Set<string>;
  baseline: Set<string>;
  observed: Set<string> | null;
  latencies: Map<string, ServerPickerLatency>;
  disabled: boolean;
  onChange: (ids: string[], blocked: boolean) => void;
  onToggle: (id: string, blocked: boolean, extend: boolean) => void;
}

export const LocationGroup = ({
  region,
  locations,
  blocked,
  baseline,
  observed,
  latencies,
  disabled,
  onChange,
  onToggle,
}: LocationGroupProps) => {
  const { t } = useTranslation();
  const blockedCount = locations.filter((location) =>
    blocked.has(location.id),
  ).length;
  const allBlocked = blockedCount === locations.length;
  const name = t(
    PICKER_REGION_KEYS.get(region) ?? "serverPicker.regions.other",
  );
  const ids = locations.map((location) => location.id);
  return (
    <section aria-label={name} className='mb-5 break-inside-avoid'>
      <div className='flex min-h-8 flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1'>
        <div className='flex items-baseline gap-2'>
          <h2 className='text-xs font-semibold'>{name}</h2>
          <span
            className={cn(
              "text-[11px] tabular-nums",
              allBlocked
                ? "text-signal-poor"
                : blockedCount === 0
                  ? "text-signal-good"
                  : "text-muted-foreground",
            )}>
            {t(
              allBlocked
                ? "serverPicker.groupAllBlocked"
                : blockedCount === 0
                  ? "serverPicker.groupAllOpen"
                  : "serverPicker.groupCount",
              { count: blockedCount, total: locations.length },
            )}
          </span>
        </div>
        <div className='flex gap-1'>
          {blockedCount > 0 && (
            <Button
              aria-label={t("serverPicker.allowRegion", { name })}
              disabled={disabled}
              onClick={() => onChange(ids, false)}
              size='sm'
              variant='ghost'
              className='h-6 px-2 text-[11px]'>
              {t("serverPicker.allowAll")}
            </Button>
          )}
          {!allBlocked && (
            <Button
              aria-label={t("serverPicker.blockRegion", { name })}
              disabled={disabled}
              onClick={() => onChange(ids, true)}
              size='sm'
              variant='ghost'
              className='h-6 px-2 text-[11px]'>
              {t("serverPicker.blockAll")}
            </Button>
          )}
        </div>
      </div>
      <ul className='border-b border-border/40'>
        {locations.map((location) => (
          <LocationRow
            key={location.id}
            location={location}
            blocked={blocked.has(location.id)}
            pending={blocked.has(location.id) !== baseline.has(location.id)}
            observed={observed ? observed.has(location.id) : null}
            latency={latencies.get(location.id)}
            disabled={disabled}
            onChange={onToggle}
          />
        ))}
      </ul>
    </section>
  );
};
