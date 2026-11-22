import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeroPicker } from "@/components/stats/party/hero-picker";
import { LineupsTable } from "@/components/stats/party/lineups-table";
import { PartyCard } from "@/components/stats/party/party-card";
import { PartyOdds } from "@/components/stats/party/party-odds";
import { usePartyPlanner } from "@/hooks/use-party-planner";
import type { DeadlockHero } from "@/lib/deadlock-api";
import type { RankAsset } from "@/lib/stats/api";
import { MAX_PARTY_SIZE, MAX_PICKS, type PickAdvice } from "@/lib/stats/party";
import type { StatsScope } from "@/lib/stats/scope";
import { usePersistedStore } from "@/lib/store";

interface PartyPlannerProps {
  heroesById: Map<number, DeadlockHero>;
  rankAssets: RankAsset[];
  scope: StatsScope;
}

/**
 * Plans a party before it queues. Each player offers up to three heroes and the
 * game gives them one, so the planner rates every lineup that can come out of
 * those picks. Global stats, so no account is involved.
 */
export const PartyPlanner = ({
  heroesById,
  rankAssets,
  scope,
}: PartyPlannerProps) => {
  const { t } = useTranslation();
  const members = usePersistedStore((state) => state.partyMembers);
  const setMembers = usePersistedStore((state) => state.setPartyMembers);
  const rankRange = usePersistedStore((state) => state.partyRankRange);
  const setRankRange = usePersistedStore((state) => state.setPartyRankRange);
  const [selectedMember, setSelectedMember] = useState(0);
  const [landed, setLanded] = useState<{
    member: number;
    heroId: number;
  } | null>(null);
  const activeMember = Math.min(selectedMember, members.length - 1);
  const candidates = useMemo(() => [...heroesById.keys()], [heroesById]);
  const planner = usePartyPlanner(members, rankRange, scope, candidates);
  const players = members.filter((picks) => picks.length > 0).length;

  const memberLabel = (index: number) =>
    index === 0
      ? t("stats.party.member.you")
      : t("stats.party.member.player", { number: index + 1 });

  // Any edit but a suggested swap clears the landing glow, so a hero added
  // back by hand does not light up as if a suggestion had placed it.
  const updateMember = (
    index: number,
    picks: number[],
    landedHeroId: number | null = null,
  ) => {
    setMembers(
      members.map((entry, position) => (position === index ? picks : entry)),
    );
    setLanded(
      landedHeroId === null ? null : { member: index, heroId: landedHeroId },
    );
  };

  const togglePick = (heroId: number) => {
    const picks = members[activeMember] ?? [];
    if (picks.includes(heroId)) {
      updateMember(
        activeMember,
        picks.filter((pick) => pick !== heroId),
      );
    } else if (picks.length < MAX_PICKS) {
      updateMember(activeMember, [...picks, heroId]);
    }
  };

  const applyAdvice = (index: number, advice: PickAdvice) => {
    const picks = members[index] ?? [];
    if (picks.includes(advice.heroId)) return;
    updateMember(
      index,
      advice.replace === null
        ? [...picks, advice.heroId]
        : picks.map((pick) => (pick === advice.replace ? advice.heroId : pick)),
      advice.heroId,
    );
  };

  const addMember = () => {
    if (members.length >= MAX_PARTY_SIZE) return;
    setMembers([...members, []]);
    setLanded(null);
    setSelectedMember(members.length);
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, position) => position !== index));
    setLanded(null);
    if (index <= activeMember) setSelectedMember(Math.max(0, activeMember - 1));
  };

  return (
    <div className='flex flex-col gap-4 pb-8'>
      <div className='grid items-start gap-4 xl:grid-cols-[1fr_340px]'>
        <PartyCard
          activeMember={activeMember}
          advice={planner.advice}
          heroesById={heroesById}
          landed={landed}
          memberLabel={memberLabel}
          members={members}
          onAddMember={addMember}
          onApplyAdvice={applyAdvice}
          onClear={() => {
            setMembers([[]]);
            setSelectedMember(0);
            setLanded(null);
          }}
          onRankRangeChange={setRankRange}
          onRemoveMember={removeMember}
          onRemovePick={(index, heroId) =>
            updateMember(
              index,
              (members[index] ?? []).filter((pick) => pick !== heroId),
            )
          }
          onSelectMember={setSelectedMember}
          rankAssets={rankAssets}
          rankRange={rankRange}
        />
        <PartyOdds
          heroesById={heroesById}
          isError={planner.isError}
          isOptimal={
            players >= 2 &&
            !planner.isAdviceStale &&
            planner.advice.every((entry) => entry === null)
          }
          isPending={planner.isPending}
          odds={planner.odds}
          players={players}
        />
      </div>
      <div className='grid items-start gap-4 xl:grid-cols-[1fr_340px]'>
        <LineupsTable
          heroesById={heroesById}
          isPending={planner.isPending}
          odds={planner.odds}
          players={players}
        />
        <HeroPicker
          heroesById={heroesById}
          onToggle={togglePick}
          playerLabel={memberLabel(activeMember)}
          selected={members[activeMember] ?? []}
        />
      </div>
    </div>
  );
};
