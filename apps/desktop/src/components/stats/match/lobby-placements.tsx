import { useTranslation } from "react-i18next";
import { ChartCard } from "@/components/stats/chart-card";
import { tint } from "@/components/stats/chart-fx";
import { teamColor } from "@/components/stats/match/item-tile";
import { formatCompact, formatPercent } from "@/lib/stats/format";
import {
  type Placement,
  type PlacementMetric,
} from "@/lib/stats/match-analysis";
import { cn } from "@/lib/utils";

const formatPlacement = (metric: PlacementMetric, value: number) =>
  metric === "accuracy"
    ? formatPercent(value, 0)
    : metric === "deaths"
      ? String(value)
      : formatCompact(value);

/** The player's finish on each metric, with the whole lobby as a strip of slots. */
export const LobbyPlacements = ({
  placements,
}: {
  placements: Placement[];
}) => {
  const { t } = useTranslation();
  return (
    <ChartCard
      description={t("stats.match.placementsDescription", {
        count: placements[0]?.order.length ?? 0,
      })}
      title={t("stats.match.placements")}>
      <div className='flex h-full flex-col gap-3.5'>
        {placements.map((placement) => {
          const top = placement.rank <= 3;
          return (
            <div className='flex flex-col gap-1.5' key={placement.metric}>
              <div className='flex items-center justify-between gap-2'>
                <span className='flex items-baseline gap-2'>
                  <span className='font-medium text-[12.5px]'>
                    {t(`stats.match.metrics.${placement.metric}`)}
                  </span>
                  <span className='font-mono text-muted-foreground text-xs'>
                    {formatPlacement(placement.metric, placement.value)}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono font-semibold text-[11px]",
                    top
                      ? "bg-primary/10 text-primary"
                      : "bg-foreground/5 text-muted-foreground",
                  )}>
                  {t("stats.match.placeOf", {
                    count: placement.rank,
                    ordinal: true,
                    total: placement.order.length,
                  })}
                </span>
              </div>
              <div aria-hidden className='flex h-2.5 gap-[3px]'>
                {placement.order.map((slot) => (
                  <span
                    className='flex-1 rounded-[3px]'
                    key={slot.slot}
                    style={
                      slot.isMe
                        ? {
                            // Foreground, not primary: a theme's primary can sit
                            // too close to a team colour to stand out.
                            backgroundColor: "hsl(var(--foreground))",
                            boxShadow:
                              "0 0 6px color-mix(in srgb, hsl(var(--foreground)) 55%, transparent)",
                          }
                        : { backgroundColor: tint(teamColor(slot.team), 24) }
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className='mt-auto flex justify-between font-mono text-[10px] text-muted-foreground/70'>
          <span>{t("stats.match.best")}</span>
          <span>{t("stats.match.worst")}</span>
        </div>
      </div>
    </ChartCard>
  );
};
