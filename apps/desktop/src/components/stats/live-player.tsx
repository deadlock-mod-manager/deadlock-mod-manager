import type { ReactNode } from "react";
import { tint } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import { heroIdOf, type ResolvedPlayer } from "@/lib/stats/live-teams";
import { cn } from "@/lib/utils";

export const playerKey = ({ player }: ResolvedPlayer, index: number) =>
  `${player.name}-${index}`;

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
  bordered?: boolean;
  frameClassName?: string;
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
