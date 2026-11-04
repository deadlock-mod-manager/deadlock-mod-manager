import { useTranslation } from "react-i18next";
import { teamColor } from "@/components/stats/match/item-tile";

export const TEAMS = [0, 1] as const;

export const TeamKey = () => {
  const { t } = useTranslation();
  return (
    <div className='flex shrink-0 items-center gap-4 text-[11.5px] text-muted-foreground'>
      {TEAMS.map((team) => (
        <span className='flex items-center gap-1.5' key={team}>
          <span
            className='h-2.5 w-2.5 rounded-[3px]'
            style={{ backgroundColor: teamColor(team) }}
          />
          {t(`stats.match.teams.${team}`)}
        </span>
      ))}
    </div>
  );
};
