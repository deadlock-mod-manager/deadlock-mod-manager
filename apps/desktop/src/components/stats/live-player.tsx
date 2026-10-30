import type { ReactNode } from "react";
import { tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { heroIdOf, type ResolvedPlayer } from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";

/** The top bar lists each player once per team, but names can repeat. */
export const playerKey = ({ player }: ResolvedPlayer, index: number) =>
  `${player.name}-${index}`;

/**
 * A player's hero portrait, ringed in their team colour when `ring` is set.
 * `radius` rounds the portrait and the ring alike.
 */
export const LiveHeroAvatar = ({
  entry,
  className,
  radius,
  ring,
  ringClassName = "border-[1.5px]",
  bordered = true,
  frameClassName = "relative shrink-0",
  children,
}: {
  entry: ResolvedPlayer;
  className: string;
  radius: string;
  ring?: string;
  ringClassName?: string;
  /** The portrait's own hairline. */
  bordered?: boolean;
  frameClassName?: string;
  /** Overlays drawn on top of the portrait. */
  children?: ReactNode;
}) => (
  <span className={frameClassName}>
    <HeroAvatar
      className={cn(
        className,
        radius,
        bordered && "border border-foreground/[0.08]",
      )}
      hero={entry.hero}
      heroId={heroIdOf(entry)}
    />
    {ring && (
      <span
        className={cn(
          "pointer-events-none absolute inset-0",
          radius,
          ringClassName,
        )}
        style={{ borderColor: ring }}
      />
    )}
    {children}
  </span>
);

/** A player row, picked out in the team colour when it is you. */
export const LivePlayerRow = ({
  isLocal,
  color,
  className,
  children,
}: {
  isLocal: boolean;
  color: string;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn("rounded-[9px] border border-transparent", className)}
    style={
      isLocal
        ? { backgroundColor: tint(color, 6), borderColor: tint(color, 18) }
        : undefined
    }>
    {children}
  </div>
);
