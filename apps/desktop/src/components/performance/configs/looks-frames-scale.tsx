import { InfoIcon } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { useTranslation } from "react-i18next";
import type { ConfigListItem } from "@/lib/performance/config-list";
import { presetPosition, TIERS, tierInfo } from "@/lib/performance/scale";
import { assignLabelRows } from "@/lib/performance/scale-pins";
import { cn } from "@/lib/utils";
import type { PerfTier } from "@/types/generated/PerfTier";
import { usePerformanceUi } from "../performance-context";
import { TierIcon } from "../tier-icon";
import { useScaleLink } from "./scale-link";

const LABEL_MIN_GAP = 0.09;
const LABEL_ROW_OFFSET = ["top-4", "top-8"] as const;

type Pin = {
  configId: string;
  name: string;
  position: number;
  kind: ConfigListItem["kind"];
  active: boolean;
};

/** Half the width of the stretch of track a tier covers around its stop. */
const TIER_BAND = 0.1;

const toPercent = (score: number) =>
  `${Math.min(0.98, Math.max(0.02, score)) * 100}%`;

/**
 * Presets and GameBanana configs placed by how much they cut, plus the active
 * config. The user's other configs have no pin: placing them would mean
 * resolving each one.
 */
const scalePins = (
  items: ConfigListItem[],
  activeConfigId: string | null,
  activeCutScore: number | null,
): Pin[] => {
  const pins: Pin[] = items.flatMap((item) => {
    const active = item.configId === activeConfigId;
    const activePosition =
      activeCutScore !== null && item.kind === "preset"
        ? presetPosition(item.tier, activeCutScore)
        : activeCutScore;
    const position = active ? (activePosition ?? item.cutScore) : item.cutScore;
    if (position === null || (item.kind === "user" && !active)) return [];
    return [
      {
        configId: item.configId,
        name: item.name,
        position,
        kind: item.kind,
        active,
      },
    ];
  });
  // The active pin is drawn last so it sits on top of neighbours.
  return pins.sort((a, b) => Number(a.active) - Number(b.active));
};

type LooksFramesScaleProps = {
  items: ConfigListItem[];
  activeConfigId: string | null;
  activeCutScore: number | null;
  selectedTier: PerfTier | null;
  onSelectTier: (tier: PerfTier | null) => void;
};

export const LooksFramesScale = ({
  items,
  activeConfigId,
  activeCutScore,
  selectedTier,
  onSelectTier,
}: LooksFramesScaleProps) => {
  const { t } = useTranslation();
  const { openDetails, setTab } = usePerformanceUi();
  const { focus, setFocus } = useScaleLink();
  const pins = scalePins(items, activeConfigId, activeCutScore);
  const labelRows = assignLabelRows(
    pins
      .filter((pin) => pin.kind === "preset" && !pin.active)
      .map((pin) => ({ id: pin.configId, position: pin.position })),
    LABEL_MIN_GAP,
  );

  return (
    <section
      aria-label={t("performance.configs.scale.label")}
      className='rounded-lg border bg-card p-4'>
      <div className='flex items-baseline justify-between gap-4 text-xs'>
        <span className='font-medium'>{t("performance.scale.looks")}</span>
        <button
          className='flex items-center gap-1.5 text-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          onClick={() => setTab("howItWorks")}
          type='button'>
          <InfoIcon aria-hidden className='size-3.5 shrink-0' />
          {t("performance.configs.scale.hint")}
        </button>
        <span className='text-right font-medium'>
          {t("performance.scale.frames")}
        </span>
      </div>

      <div className='relative mx-3 mt-9 mb-12 h-1.5'>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-r from-primary/15 to-primary/80 transition-opacity duration-200 ease-out",
            focus?.kind === "tier" && "opacity-30",
          )}
        />
        {TIERS.map((info) => (
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 rounded-full bg-primary transition-opacity duration-200 ease-out",
              focus?.kind === "tier" && focus.tier === info.id
                ? "opacity-100"
                : "opacity-0",
            )}
            key={info.id}
            style={{
              left: `${(info.position - TIER_BAND) * 100}%`,
              width: `${TIER_BAND * 2 * 100}%`,
            }}
          />
        ))}
        {pins.map((pin) => {
          const row = labelRows.get(pin.configId) ?? null;
          const dimmed =
            focus?.kind === "tier" &&
            Math.abs(pin.position - tierInfo(focus.tier).position) > TIER_BAND;
          const pointedAt =
            focus?.kind === "config" && focus.configId === pin.configId;
          return (
            <div
              className='absolute top-1/2 -translate-x-1/2 -translate-y-1/2'
              key={pin.configId}
              style={{ left: toPercent(pin.position) }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label={t("performance.configs.scale.pin", {
                      name: pin.name,
                    })}
                    className={cn(
                      "block rounded-full border-primary bg-card transition-[transform,opacity] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      pin.kind === "community"
                        ? "size-2.5 border"
                        : "size-3.5 border-2",
                      pin.active && "size-4 bg-primary ring-4 ring-primary/25",
                      pointedAt && "scale-150",
                      dimmed && "opacity-25",
                    )}
                    onBlur={() => setFocus(null)}
                    onClick={() => openDetails(pin.configId)}
                    onFocus={() =>
                      setFocus({ kind: "config", configId: pin.configId })
                    }
                    onPointerEnter={() =>
                      setFocus({ kind: "config", configId: pin.configId })
                    }
                    onPointerLeave={() => setFocus(null)}
                    type='button'
                  />
                </TooltipTrigger>
                <TooltipContent>{pin.name}</TooltipContent>
              </Tooltip>
              {pin.active && (
                <span className='pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-medium text-[11px] text-primary'>
                  {t("performance.configs.scale.you", { name: pin.name })}
                </span>
              )}
              {row !== null && (
                <span
                  className={cn(
                    "pointer-events-none absolute left-1/2 max-w-28 -translate-x-1/2 truncate whitespace-nowrap text-[11px] text-muted-foreground",
                    LABEL_ROW_OFFSET[row],
                  )}>
                  {pin.name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className='grid grid-cols-5 gap-2'>
        {TIERS.map((info) => {
          const selected = selectedTier === info.id;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "perf-tier flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary/70 bg-primary/10"
                  : "border-transparent bg-muted/20",
              )}
              key={info.id}
              onBlur={() => setFocus(null)}
              onClick={() => onSelectTier(selected ? null : info.id)}
              onFocus={() => setFocus({ kind: "tier", tier: info.id })}
              onPointerEnter={() => setFocus({ kind: "tier", tier: info.id })}
              onPointerLeave={() => setFocus(null)}
              type='button'>
              {/* Picking a tier renders it again, outline first. */}
              <TierIcon
                className='size-5'
                draw={selected}
                key={selected ? "picked" : "idle"}
                tier={info.id}
              />
              <span className='min-w-0'>
                <span className='block truncate font-medium text-sm'>
                  {t(`performance.tiers.${info.id}.label`)}
                </span>
                <span className='hidden truncate text-muted-foreground text-xs lg:block'>
                  {t(`performance.tiers.${info.id}.quip`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
