import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Coffee } from "@deadlock-mods/ui/icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { LOSS_COLOR, NOTE_CLASS, tint } from "@/components/stats/chart-fx";
import type { MatchHistoryEntry } from "@/lib/stats/api";
import {
  MAX_SESSION_POSITION,
  sessionCurve,
  summarize,
} from "@/lib/stats/derive";
import { formatPercent } from "@/lib/stats/format";

/** Fewer games than this in a slot is noise, not a pattern worth calling out. */
const MIN_CALLOUT_MATCHES = 5;

/** Bars top out below the frame so a 100% slot still has room for its label. */
const BAR_SCALE = 88;

const PRIMARY = "hsl(var(--primary))";
const NEUTRAL = "hsl(var(--foreground))";

const hatch = (color: string, strength: number) =>
  `repeating-linear-gradient(135deg, ${tint(color, strength)} 0 1px, transparent 1px 7px), ${tint(color, strength / 3)}`;

interface SessionChartProps {
  matches: MatchHistoryEntry[];
}

/**
 * Winrate by position within a play session. The shape answers "when should I
 * stop for today" better than any average can.
 */
export const SessionChart = ({ matches }: SessionChartProps) => {
  const { t } = useTranslation();

  const { slots, baseline, best, dropsAfter } = useMemo(() => {
    const curve = sessionCurve(matches);
    const reliable = curve.filter(
      (slot) => slot.matches >= MIN_CALLOUT_MATCHES,
    );
    const firstLosing = reliable.find(
      (slot, index) => index > 0 && slot.winrate < 0.5,
    );
    return {
      slots: curve,
      baseline: summarize(matches).winrate,
      best:
        [...reliable].sort((a, b) => b.winrate - a.winrate)[0]?.bucket ?? null,
      dropsAfter: firstLosing ? firstLosing.bucket - 1 : null,
    };
  }, [matches]);

  if (slots.length < 2) {
    return null;
  }

  return (
    <ChartCard
      description={t("stats.charts.sessionDescription")}
      title={t("stats.charts.sessionTitle")}>
      <div className='flex h-full min-h-[220px] flex-col gap-3'>
        {/* Bars only: the baseline and the labels share its percentage scale. */}
        <div className='relative flex min-h-[140px] flex-1 items-end gap-2.5 pt-5'>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-x-0 border-primary/35 border-t border-dashed'
            style={{ bottom: `${baseline * BAR_SCALE}%` }}
          />
          {slots.map((slot) => {
            const isBest = slot.bucket === best;
            // Too few games to mean anything: still shown, but faded and dashed.
            const isThin = slot.matches < MIN_CALLOUT_MATCHES;
            const color = isBest
              ? PRIMARY
              : slot.winrate < 0.5
                ? LOSS_COLOR
                : NEUTRAL;
            const height = `${slot.winrate * BAR_SCALE}%`;
            return (
              <Tooltip key={slot.bucket}>
                <TooltipTrigger asChild>
                  <div
                    className='relative h-full min-w-0 flex-1 cursor-default'
                    style={{ opacity: isThin ? 0.45 : 1 }}>
                    <span
                      className='absolute inset-x-0 text-center font-mono font-semibold text-[11px] tabular-nums'
                      style={{
                        bottom: `calc(${height} + 4px)`,
                        color: isBest ? PRIMARY : undefined,
                      }}>
                      {formatPercent(slot.winrate, 0)}
                    </span>
                    <div
                      className='absolute inset-x-0 bottom-0 rounded-t-md rounded-b-sm border'
                      style={{
                        height,
                        background: hatch(color, isBest ? 40 : 22),
                        borderColor: tint(color, isBest ? 60 : 25),
                        borderStyle: isThin ? "dashed" : "solid",
                        borderTop: `3px solid ${tint(color, isBest ? 100 : 45)}`,
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {t("stats.charts.sessionTooltip", { position: slot.bucket })}
                  {": "}
                  {formatPercent(slot.winrate, 0)}{" "}
                  {t("stats.charts.matchCount", { count: slot.matches })}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className='flex gap-2.5'>
          {slots.map((slot) => (
            <div
              className='flex min-w-0 flex-1 flex-col items-center leading-tight'
              key={slot.bucket}>
              <span className='font-mono font-semibold text-[11px]'>
                {slot.bucket >= MAX_SESSION_POSITION
                  ? t("stats.session.lastSlot", { position: slot.bucket })
                  : t("stats.charts.sessionTick", { position: slot.bucket })}
              </span>
              <span className='font-mono text-[10px] text-muted-foreground/70'>
                {slot.matches}
              </span>
            </div>
          ))}
        </div>
        {dropsAfter !== null && (
          <p className={NOTE_CLASS}>
            <Coffee aria-hidden className='h-3.5 w-3.5 shrink-0 text-primary' />
            {t("stats.session.dropsAfter", { count: dropsAfter })}
          </p>
        )}
      </div>
    </ChartCard>
  );
};
