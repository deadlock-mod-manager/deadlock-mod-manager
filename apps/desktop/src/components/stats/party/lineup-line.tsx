import { winrateColor } from "@/components/stats/chart-fx";
import { HeroAvatar } from "@/components/stats/hero-avatar";
import type { DeadlockHero } from "@/lib/deadlock-api";
import { formatPercent } from "@/lib/stats/format";
import type { RatedLineup } from "@/lib/stats/party";

export const LineupLine = ({
  label,
  lineup,
  heroesById,
}: {
  label: string;
  lineup: RatedLineup;
  heroesById: Map<number, DeadlockHero>;
}) => (
  <div className='flex flex-col gap-1.5 border-foreground/[0.06] border-t pt-2.5'>
    <span className='font-bold text-[9.5px] text-muted-foreground uppercase tracking-[0.1em]'>
      {label}
    </span>
    <span className='flex items-center justify-between'>
      <span className='flex -space-x-2'>
        {lineup.heroIds.map((heroId) => (
          <HeroAvatar
            className='h-7 w-7 rounded-full ring-2 ring-card'
            hero={heroesById.get(heroId)}
            heroId={heroId}
            key={heroId}
          />
        ))}
      </span>
      {lineup.stat && (
        <span
          className='font-bold font-mono text-sm'
          style={{ color: winrateColor(lineup.stat.winrate) }}>
          {formatPercent(lineup.stat.winrate)}
        </span>
      )}
    </span>
  </div>
);
