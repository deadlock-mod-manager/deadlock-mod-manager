import { Button } from "@deadlock-mods/ui/components/button";
import { Card } from "@deadlock-mods/ui/components/card";
import { RotateCcw, UserPlus } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { PartyMemberRow } from "@/components/stats/party/party-member-row";
import { RankRangePicker } from "@/components/stats/party/rank-range-picker";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";
import {
  MAX_PARTY_SIZE,
  type PickAdvice,
  type RankRange,
} from "@/lib/stats/party";

interface PartyCardProps {
  members: number[][];
  activeMember: number;
  advice: Array<PickAdvice | null>;
  /** The pick a suggested swap just placed, so its chip can glow once. */
  landed: { member: number; heroId: number } | null;
  heroesById: Map<number, DeadlockHero>;
  rankRange: RankRange;
  rankAssets: RankAsset[];
  memberLabel: (index: number) => string;
  onRankRangeChange: (range: RankRange) => void;
  onSelectMember: (index: number) => void;
  onRemovePick: (index: number, heroId: number) => void;
  onApplyAdvice: (index: number, advice: PickAdvice) => void;
  onRemoveMember: (index: number) => void;
  onAddMember: () => void;
  onClear: () => void;
}

/** The party being planned: every player's offered heroes and the rank filter. */
export const PartyCard = ({
  members,
  activeMember,
  advice,
  landed,
  heroesById,
  rankRange,
  rankAssets,
  memberLabel,
  onRankRangeChange,
  onSelectMember,
  onRemovePick,
  onApplyAdvice,
  onRemoveMember,
  onAddMember,
  onClear,
}: PartyCardProps) => {
  const { t } = useTranslation();
  const isEmpty =
    members.length === 1 && members.every((picks) => picks.length === 0);

  return (
    <Card className='stats-surface flex flex-col gap-3.5 p-5 shadow-none'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h2 className='font-semibold text-[15px]'>
            {t("stats.party.title")}
          </h2>
          <p className='text-muted-foreground text-xs'>
            {t("stats.party.description")}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <RankRangePicker
            onChange={onRankRangeChange}
            range={rankRange}
            rankAssets={rankAssets}
          />
          <Button
            className='h-8 gap-1.5 px-2.5 text-[12.5px] text-muted-foreground'
            disabled={isEmpty}
            onClick={onClear}
            size='sm'
            variant='ghost'>
            <RotateCcw aria-hidden className='h-3.5 w-3.5' />
            {t("stats.party.clear")}
          </Button>
        </div>
      </div>
      {members.map((picks, index) => (
        <PartyMemberRow
          advice={advice[index] ?? null}
          canRemove={members.length > 1}
          heroesById={heroesById}
          isActive={index === activeMember}
          // oxlint-disable-next-line react/no-array-index-key -- players have no identity beyond their place in the party
          key={index}
          label={memberLabel(index)}
          landedHeroId={landed?.member === index ? landed.heroId : null}
          onApplyAdvice={(next) => onApplyAdvice(index, next)}
          onRemove={() => onRemoveMember(index)}
          onRemovePick={(heroId) => onRemovePick(index, heroId)}
          onSelect={() => onSelectMember(index)}
          picks={picks}
        />
      ))}
      {members.length < MAX_PARTY_SIZE && (
        <Button
          className='h-8 gap-1.5 self-start rounded-lg px-3 font-semibold text-[12.5px] text-muted-foreground'
          onClick={onAddMember}
          size='sm'
          variant='outline'>
          <UserPlus aria-hidden className='h-3.5 w-3.5' />
          {t("stats.party.member.add")}
        </Button>
      )}
    </Card>
  );
};
