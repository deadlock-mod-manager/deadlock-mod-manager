import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { Info } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LINEUP_GRID, LineupRow } from "@/components/stats/party/lineup-row";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatWhole } from "@/lib/stats/format";
import { LOW_SAMPLE_MATCHES, type PartyOdds } from "@/lib/stats/party";
import { cn } from "@/lib/utils";

const SHOWN_LINEUPS = 10;

type LineupOrder = "best" | "worst";
const LINEUP_ORDERS: LineupOrder[] = ["best", "worst"];
const isLineupOrder = (value: string): value is LineupOrder =>
  LINEUP_ORDERS.some((order) => order === value);

interface LineupsTableProps {
  players: number;
  odds: PartyOdds;
  heroesById: Map<number, DeadlockHero>;
  isPending: boolean;
}

export const LineupsTable = ({
  players,
  odds,
  heroesById,
  isPending,
}: LineupsTableProps) => {
  const { t } = useTranslation();
  const [order, setOrder] = useState<LineupOrder>("best");
  const [showAll, setShowAll] = useState(false);
  // `odds.lineups` arrive best first, with the lineups that have no data last.
  const ordered =
    order === "best"
      ? odds.lineups
      : [...odds.lineups].sort(
          (a, b) => (a.stat?.winrate ?? 2) - (b.stat?.winrate ?? 2),
        );
  const shown = showAll ? ordered : ordered.slice(0, SHOWN_LINEUPS);

  return (
    <Card className='stats-surface flex flex-col pb-2 shadow-none'>
      <div className='flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3'>
        <div className='min-w-0'>
          <h2 className='font-semibold text-[15px]'>
            {t("stats.party.lineups.title")}
          </h2>
          <p className='text-muted-foreground text-xs'>
            {players < 2
              ? t("stats.party.lineups.descriptionEmpty")
              : t("stats.party.lineups.description", {
                  count: odds.lineups.length,
                })}
          </p>
        </div>
        <ToggleGroup
          aria-label={t("stats.party.lineups.order")}
          className='h-8 justify-start gap-0.5 rounded-lg border bg-background p-[3px]'
          onValueChange={(value) => {
            if (isLineupOrder(value)) setOrder(value);
          }}
          size='sm'
          type='single'
          value={order}>
          {LINEUP_ORDERS.map((value) => (
            <ToggleGroupItem
              className='h-[24px] rounded-md px-3 font-semibold text-[12.5px] text-muted-foreground hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground data-[state=on]:shadow-none'
              key={value}
              value={value}>
              {t(`stats.party.lineups.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {players < 2 ? (
        <p className='px-5 py-8 text-center text-muted-foreground text-sm'>
          {t("stats.party.odds.needPlayers")}
        </p>
      ) : odds.lineups.length === 0 ? (
        <p className='px-5 py-8 text-center text-muted-foreground text-sm'>
          {t("stats.party.lineups.noLineups")}
        </p>
      ) : (
        <>
          <div className='overflow-x-auto'>
            <div className='min-w-[600px]'>
              <div
                className={cn(
                  LINEUP_GRID,
                  "border-foreground/[0.04] border-y px-5 py-1.5 font-bold text-[10.5px] text-muted-foreground/70 uppercase tracking-[0.08em]",
                )}>
                <span>#</span>
                <span>{t("stats.party.lineups.lineup")}</span>
                <span>{t("stats.party.lineups.winrate")}</span>
                <span>{t("stats.party.lineups.matches")}</span>
              </div>
              {isPending
                ? Array.from({ length: 6 }, (_, index) => (
                    <div className='px-5 py-2' key={index}>
                      <Skeleton className='h-8 w-full' />
                    </div>
                  ))
                : shown.map((lineup, index) => (
                    <LineupRow
                      expected={odds.expected}
                      heroesById={heroesById}
                      key={lineup.heroIds.join(",")}
                      lineup={lineup}
                      rank={index + 1}
                    />
                  ))}
            </div>
          </div>
          {!isPending && ordered.length > SHOWN_LINEUPS && (
            <Button
              className='mx-5 mt-2 h-7 self-start px-2 text-muted-foreground text-xs'
              onClick={() => setShowAll(!showAll)}
              size='sm'
              variant='ghost'>
              {showAll
                ? t("stats.party.lineups.showFewer")
                : t("stats.party.lineups.showAll", { count: ordered.length })}
            </Button>
          )}
          <p className='flex items-center gap-1.5 px-5 pt-2.5 text-[11.5px] text-muted-foreground'>
            <Info aria-hidden className='h-3.5 w-3.5 shrink-0' />
            {t("stats.party.lineups.footnote", {
              matches: formatWhole(LOW_SAMPLE_MATCHES),
            })}
          </p>
        </>
      )}
    </Card>
  );
};
