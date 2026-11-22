import { Button } from "@deadlock-mods/ui/components/button";
import {
  Download,
  ExternalLink,
  Eye,
  Flag,
  Gamepad2,
  Hammer,
  Loader2,
  Moon,
  Radio,
  Search,
  ToggleLeft,
  Trophy,
} from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  INFO_COLOR,
  LOSS_COLOR,
  tint,
  WIN_COLOR,
} from "@/components/stats/chart-fx";
import { PANEL_CLASS } from "@/components/stats/live-parts";
import { useLaunch } from "@/hooks/use-launch";
import { useNow } from "@/hooks/use-now";
import { formatClock } from "@/lib/stats/format";
import { cn } from "@/lib/utils";

const IconTile = ({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) => (
  <span
    className='flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border'
    style={{
      color,
      backgroundColor: tint(color, 10),
      borderColor: tint(color, 22),
    }}>
    {children}
  </span>
);

/**
 * Where the state of the tab is said, in the slot your hero takes once a match
 * runs, so nothing moves when one starts.
 */
export const LiveBanner = ({
  icon,
  color,
  title,
  description,
  aside,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      PANEL_CLASS,
      "flex flex-wrap items-center gap-x-8 gap-y-4 px-[23px] py-[19px]",
    )}
    style={{
      backgroundImage: `linear-gradient(90deg, ${tint(color, 8)}, transparent 45%)`,
    }}>
    <div className='flex min-w-0 flex-1 items-center gap-4'>
      <IconTile color={color}>{icon}</IconTile>
      <div className='flex min-w-0 flex-col gap-1'>
        <span className='font-bold text-xl tracking-tight'>{title}</span>
        <span className='max-w-xl text-[13px] text-muted-foreground leading-relaxed'>
          {description}
        </span>
        {children}
      </div>
    </div>
    {aside && <div className='flex items-center gap-2'>{aside}</div>}
  </div>
);

export const LiveInstallBanner = ({
  inLibrary,
  isInstalling,
  onInstall,
}: {
  inLibrary: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}) => {
  const { t } = useTranslation();
  const [explained, setExplained] = useState(false);
  const points = [
    { Icon: Eye, label: t("stats.live.states.install.readsTopBar") },
    { Icon: Hammer, label: t("stats.live.states.install.builtFromGame") },
    { Icon: ToggleLeft, label: t("stats.live.states.install.turnOff") },
  ];
  return (
    <LiveBanner
      aside={
        <>
          <Button disabled={isInstalling} onClick={onInstall}>
            {isInstalling ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Download className='h-4 w-4' />
            )}
            {isInstalling
              ? t("stats.live.bridge.installing")
              : inLibrary
                ? t("stats.live.bridge.enable")
                : t("stats.live.states.install.action")}
          </Button>
          <Button
            onClick={() => setExplained((open) => !open)}
            variant='outline'>
            {t("stats.live.states.install.howItWorks")}
          </Button>
        </>
      }
      color='hsl(var(--primary))'
      description={
        inLibrary
          ? t("stats.live.bridge.disabledDescription")
          : t("stats.live.states.install.description")
      }
      icon={<Radio className='h-6 w-6' />}
      title={
        inLibrary
          ? t("stats.live.bridge.disabledTitle")
          : t("stats.live.states.install.title")
      }>
      <div className='flex flex-wrap gap-x-5 gap-y-1.5 pt-1.5'>
        {points.map(({ Icon, label }) => (
          <span className='flex items-center gap-2 text-[12.5px]' key={label}>
            <Icon
              className='h-3.5 w-3.5 shrink-0'
              style={{ color: WIN_COLOR }}
            />
            {label}
          </span>
        ))}
      </div>
      {explained && (
        <span className='mt-2 max-w-xl rounded-lg border bg-background px-3 py-2.5 text-muted-foreground text-xs leading-relaxed'>
          {t("stats.live.bridge.modDescription")}
        </span>
      )}
    </LiveBanner>
  );
};

export const LiveClosedBanner = () => {
  const { t } = useTranslation();
  const { launch } = useLaunch();
  const start = useMutation({ mutationFn: () => launch() });
  return (
    <LiveBanner
      aside={
        <Button disabled={start.isPending} onClick={() => start.mutate()}>
          {start.isPending ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Gamepad2 className='h-4 w-4' />
          )}
          {t("stats.live.states.closed.launch")}
        </Button>
      }
      color='hsl(var(--muted-foreground))'
      description={t("stats.live.states.closed.description")}
      icon={<Moon className='h-6 w-6' />}
      title={t("stats.live.notRunningTitle")}
    />
  );
};

export const LiveQueuedBanner = ({ since }: { since: number | null }) => {
  const { t } = useTranslation();
  const now = useNow();
  return (
    <LiveBanner
      aside={
        since !== null && (
          <span
            className='font-bold font-mono text-[32px] tabular-nums'
            style={{ color: INFO_COLOR }}>
            {formatClock(Math.max(0, (now - since) / 1000))}
          </span>
        )
      }
      color={INFO_COLOR}
      description={t("stats.live.states.queued.description")}
      icon={<Search className='h-6 w-6' />}
      title={t("stats.live.queuedTitle")}
    />
  );
};

/** The finished match's banner: its result, and a way into the full match once the API has it. */
export const LiveMatchOverBanner = ({
  matchId,
  inHistory,
  clock,
  result,
}: {
  matchId: string | null;
  /** The API has the match, so its detail page can open. */
  inHistory: boolean;
  clock: string | null;
  result: "win" | "loss" | null;
}) => {
  const { t } = useTranslation();
  const color =
    result === "win"
      ? WIN_COLOR
      : result === "loss"
        ? LOSS_COLOR
        : "hsl(var(--muted-foreground))";
  const title =
    result === "win"
      ? t("stats.live.states.victory")
      : result === "loss"
        ? t("stats.live.states.defeat")
        : t("stats.live.states.over.ended");

  return (
    <LiveBanner
      aside={
        matchId &&
        (inHistory ? (
          <Button asChild variant='outline'>
            <Link to={`/stats/matches/${matchId}`}>
              <ExternalLink className='h-4 w-4' />
              {t("stats.live.states.over.details")}
            </Link>
          </Button>
        ) : (
          <>
            <span className='text-muted-foreground text-xs'>
              {t("stats.live.states.over.detailsSoon")}
            </span>
            <Button disabled variant='outline'>
              <ExternalLink className='h-4 w-4' />
              {t("stats.live.states.over.details")}
            </Button>
          </>
        ))
      }
      color={color}
      description={t("stats.live.states.over.description", {
        clock: clock ?? "",
      })}
      icon={
        result === "win" ? (
          <Trophy className='h-6 w-6' />
        ) : (
          <Flag className='h-6 w-6' />
        )
      }
      title={title}
    />
  );
};
