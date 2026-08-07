import { Button } from "@deadlock-mods/ui/components/button";
import { Slider } from "@deadlock-mods/ui/components/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowDown, ArrowUp, Pause, Play } from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeadlockItem } from "@/lib/deadlock-api";
import type { MatchMetadataPlayer } from "@/lib/stats/api";
import {
  inventoryAt,
  itemTransactions,
  statAt,
} from "@/lib/stats/match-detail";
import { formatClock, formatCompact } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

/** The grid is eight wide; the number of rows follows the build itself. */
const SLOTS_PER_ROW = 8;
const VISIBLE_TRANSACTIONS = 3;
const PLAYBACK_DURATION_MS = 8_000;

type PlaybackStart = {
  gameTime: number;
  realTime: number;
};

const itemTone = (slotType: string | undefined): string => {
  switch (slotType) {
    case "weapon":
      return "border-amber-500/60 bg-amber-500/10";
    case "vitality":
      return "border-emerald-500/60 bg-emerald-500/10";
    case "spirit":
      return "border-violet-500/60 bg-violet-500/10";
    default:
      return "border-border bg-muted/30";
  }
};

const ItemSlot = ({ item }: { item?: DeadlockItem }) => {
  // An empty slot is a spacer that keeps the grid from reflowing as the build
  // fills up, not something to draw a box around.
  if (!item) {
    return <div aria-hidden className='aspect-square' />;
  }

  const image = item.shop_image_webp ?? item.shop_image;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          aria-label={item.name}
          className={cn(
            "flex aspect-square items-center justify-center overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            itemTone(item.item_slot_type),
          )}
          role='img'
          tabIndex={0}>
          {image ? (
            <img
              alt={item.name}
              className='h-full w-full object-cover'
              src={image}
            />
          ) : (
            <span className='font-semibold text-xs'>{item.name.charAt(0)}</span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>{item.name}</TooltipContent>
    </Tooltip>
  );
};

interface ItemPurchaseTimelineProps {
  duration: number;
  player: MatchMetadataPlayer;
  itemsById: Map<number, DeadlockItem>;
}

export const ItemPurchaseTimeline = ({
  duration,
  player,
  itemsById,
}: ItemPurchaseTimelineProps) => {
  const { t } = useTranslation();
  const [playhead, setPlayhead] = useState(duration);
  const [isPlaying, setIsPlaying] = useState(false);
  const playbackStart = useRef<PlaybackStart>({
    gameTime: duration,
    realTime: 0,
  });
  const transactions = useMemo(
    () => itemTransactions(player.items, itemsById),
    [player.items, itemsById],
  );
  const inventory = useMemo(
    () => inventoryAt(player.items, itemsById, playhead),
    [player.items, itemsById, playhead],
  );
  const currentStat = useMemo(
    () => statAt(player.stats, playhead),
    [player.stats, playhead],
  );
  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.time <= playhead)
        .slice(-VISIBLE_TRANSACTIONS)
        .reverse(),
    [transactions, playhead],
  );
  const bought = transactions.filter(({ kind }) => kind === "buy").length;
  const sold = transactions.length - bought;

  // Sizing the grid to the build's peak keeps it from growing a row mid-playback
  // while never reserving space for items the player never owned at once.
  const slotCount = useMemo(() => {
    let owned = 0;
    let peak = 0;
    for (const transaction of transactions) {
      owned += transaction.kind === "buy" ? 1 : -1;
      peak = Math.max(peak, owned);
    }
    return Math.max(Math.ceil(peak / SLOTS_PER_ROW), 1) * SLOTS_PER_ROW;
  }, [transactions]);

  useEffect(() => {
    if (!isPlaying) return;
    const start = playbackStart.current;
    const gameTimeRemaining = Math.max(duration - start.gameTime, 0);
    const animationDuration =
      PLAYBACK_DURATION_MS * (gameTimeRemaining / Math.max(duration, 1));
    let frame = 0;

    const animate = (now: number) => {
      const progress =
        animationDuration === 0
          ? 1
          : Math.min((now - start.realTime) / animationDuration, 1);
      setPlayhead(start.gameTime + gameTimeRemaining * progress);

      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, isPlaying]);

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    const startTime = playhead >= duration ? 0 : playhead;
    setPlayhead(startTime);
    playbackStart.current = {
      gameTime: startTime,
      realTime: window.performance.now(),
    };
    setIsPlaying(true);
  };

  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'>
        <h3 className='font-semibold text-sm'>
          {t("stats.player.itemization")}
        </h3>
        <p className='text-muted-foreground text-xs tabular-nums'>
          {t("stats.player.buildSummary", {
            active: inventory.length,
            bought,
            sold,
          })}
        </p>
      </div>

      <div className='flex items-center gap-3'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={
                isPlaying
                  ? t("stats.player.pauseBuild")
                  : t("stats.player.playBuild")
              }
              className='h-10 w-10 shrink-0 rounded-full'
              onClick={togglePlayback}
              size='icon'
              type='button'>
              {isPlaying ? <Pause /> : <Play />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isPlaying
              ? t("stats.player.pauseBuild")
              : t("stats.player.playBuild")}
          </TooltipContent>
        </Tooltip>

        <div className='min-w-0 flex-1'>
          <div className='relative flex h-8 items-center'>
            <Slider
              aria-label={t("stats.player.matchTimeline")}
              className='[&>span:first-child]:h-2 [&>span:last-child]:h-5 [&>span:last-child]:w-5'
              max={Math.max(duration, 1)}
              onValueChange={([value]) => {
                setIsPlaying(false);
                setPlayhead(value);
              }}
              step={1}
              value={[playhead]}
            />
            {transactions.map((transaction) => (
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-1/2 z-10 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  transaction.kind === "buy"
                    ? "bg-primary-foreground/80"
                    : "bg-destructive",
                )}
                key={transaction.id}
                style={{
                  left: `${(transaction.time / Math.max(duration, 1)) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className='flex justify-between text-[10px] text-muted-foreground tabular-nums'>
            <span>0:00</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>
        <span className='w-14 shrink-0 text-right font-semibold text-sm tabular-nums'>
          {formatClock(playhead)}
        </span>
      </div>

      <div className='grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(20rem,1fr)_minmax(17rem,0.8fr)]'>
        <div>
          <div className='mb-1.5 flex items-baseline justify-between gap-3'>
            <span className='font-medium text-xs'>
              {t("stats.player.inventory")}
            </span>
            <span className='text-muted-foreground text-xs tabular-nums'>
              {currentStat
                ? t("stats.player.timelineSnapshot", {
                    kda: `${currentStat.kills}/${currentStat.deaths}/${currentStat.assists}`,
                    souls: formatCompact(currentStat.net_worth),
                  })
                : t("stats.player.matchStart")}
            </span>
          </div>
          <div className='grid grid-cols-8 gap-1.5'>
            {Array.from({ length: slotCount }, (_, index) => (
              <ItemSlot item={inventory[index]} key={index} />
            ))}
          </div>
        </div>

        <div>
          <h4 className='mb-1.5 font-medium text-xs'>
            {t("stats.player.transactions")}
          </h4>
          {/* Rows on a shared surface: a border per purchase turned a three-line
              log into three more boxes. The height is reserved for the full log
              so scrubbing does not shift the build grid beside it. */}
          <div className='min-h-[6.75rem] divide-y'>
            {visibleTransactions.length > 0 ? (
              visibleTransactions.map((transaction) => {
                const Icon = transaction.kind === "buy" ? ArrowUp : ArrowDown;
                const image =
                  transaction.item.shop_image_webp ??
                  transaction.item.shop_image;
                return (
                  <div
                    className='grid h-9 grid-cols-[2.75rem_1rem_1.5rem_minmax(0,1fr)] items-center gap-2 text-xs'
                    key={transaction.id}>
                    <span className='text-muted-foreground tabular-nums'>
                      {formatClock(transaction.time)}
                    </span>
                    <Icon
                      aria-hidden
                      className={cn(
                        "h-3.5 w-3.5",
                        transaction.kind === "buy"
                          ? "text-emerald-500"
                          : "text-destructive",
                      )}
                    />
                    <span className='sr-only'>
                      {t(`stats.player.${transaction.kind}`)}
                    </span>
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center overflow-hidden rounded-sm border",
                        itemTone(transaction.item.item_slot_type),
                      )}>
                      {image ? (
                        <img
                          alt=''
                          className='h-full w-full object-cover'
                          src={image}
                        />
                      ) : (
                        <span className='font-semibold text-[10px]'>
                          {transaction.item.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <span className='truncate font-medium'>
                      {transaction.item.name}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className='flex h-9 items-center text-muted-foreground text-xs'>
                {t("stats.player.noTransactionsYet")}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
