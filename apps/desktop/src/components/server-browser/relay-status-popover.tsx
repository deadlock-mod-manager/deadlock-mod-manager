import type { RelayHealth } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { BroadcastIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FlagGlyph } from "./region-flag";

interface RelayStatusPopoverProps {
  relays: RelayHealth[];
  className?: string;
  variant?: "default" | "compact";
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}

const statusColor = (relay: RelayHealth): string => {
  if (relay.healthy) return "bg-emerald-500";
  if (relay.consecutiveFailures < 3) return "bg-amber-500";
  return "bg-rose-500";
};

const statusKey = (relay: RelayHealth) => {
  if (relay.healthy) return "online" as const;
  if (relay.consecutiveFailures < 3) return "degraded" as const;
  return "offline" as const;
};

const overallColor = (healthy: number, total: number): string => {
  if (total === 0) return "bg-muted-foreground";
  if (healthy === total) return "bg-emerald-500";
  if (healthy === 0) return "bg-rose-500";
  return "bg-amber-500";
};

const overallIconColor = (healthy: number, total: number): string => {
  if (total === 0) return "text-muted-foreground";
  if (healthy === total) return "text-primary";
  if (healthy === 0) return "text-red-500";
  return "text-yellow-500";
};

const RelayStatusPopover = ({
  relays,
  className,
  variant = "default",
  side,
  align = "end",
}: RelayStatusPopoverProps) => {
  const { t } = useTranslation();
  const healthy = relays.filter((r) => r.healthy).length;
  const total = relays.length;

  if (total === 0) {
    return null;
  }

  const isCompact = variant === "compact";
  const summary = t("servers.network.summary", { healthy, total });

  const trigger = (
    <Button
      aria-label={summary}
      className={cn(
        isCompact
          ? "h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
          : "h-8 gap-2 px-2 text-xs",
        className,
      )}
      size='sm'
      variant='ghost'>
      {isCompact ? (
        <BroadcastIcon
          className={cn("h-3.5 w-3.5", overallIconColor(healthy, total))}
          weight='fill'
        />
      ) : (
        <>
          <span className='relative inline-flex size-2'>
            {healthy === total && (
              <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60' />
            )}
            <span
              className={cn(
                "relative inline-flex size-full rounded-full",
                overallColor(healthy, total),
              )}
            />
          </span>
          <span className='font-mono tabular-nums'>{summary}</span>
          <CaretDownIcon className='size-3 opacity-60' />
        </>
      )}
    </Button>
  );

  return (
    <Popover>
      {isCompact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side='top' sideOffset={8}>
            <p>{summary}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align={align}
        className='w-80 p-3'
        side={side}
        sideOffset={8}>
        <div className='mb-2 flex items-center justify-between'>
          <h4 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            {t("servers.network.title")}
          </h4>
          <span className='font-mono text-[11px] tabular-nums text-muted-foreground'>
            {t("servers.stats.relays", { healthy, total })}
          </span>
        </div>
        <ul className='space-y-1.5' role='list'>
          {relays.map((relay) => {
            const key = statusKey(relay);
            const hostname = (() => {
              try {
                return new URL(relay.url).hostname;
              } catch {
                return relay.url;
              }
            })();
            return (
              <li
                key={relay.url}
                className='flex items-start justify-between gap-2 rounded-md border border-border/40 bg-card/40 px-2 py-1.5'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span className='relative inline-flex size-2 shrink-0'>
                    {relay.healthy && (
                      <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60' />
                    )}
                    <span
                      className={cn(
                        "relative inline-flex size-2 rounded-full",
                        statusColor(relay),
                      )}
                    />
                  </span>
                  <FlagGlyph className='size-3.5' region={relay.region} />
                  <div className='min-w-0'>
                    <div className='truncate text-xs font-medium uppercase'>
                      {relay.region ?? hostname}
                    </div>
                    <div className='truncate font-mono text-[10px] text-muted-foreground'>
                      {hostname}
                    </div>
                  </div>
                </div>
                <div className='shrink-0 text-right'>
                  <div className='text-[11px] capitalize text-muted-foreground'>
                    {t(`servers.relayBar.${key}`)}
                  </div>
                  {typeof relay.lastLatencyMs === "number" && (
                    <div className='font-mono text-[10px] tabular-nums text-muted-foreground'>
                      {t("servers.relayBar.latency", {
                        ms: relay.lastLatencyMs,
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default RelayStatusPopover;
