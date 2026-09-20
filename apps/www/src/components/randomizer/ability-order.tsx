import {
  abilityImage,
  type DeadlockAbility,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import { ABILITY_SLOTS, type AbilityStep } from "@/lib/randomizer/roll";
import { cn } from "@/lib/utils";
import { MicroLabel } from "./primitives";

interface AbilityOrderProps {
  steps: AbilityStep[];
  abilities: (DeadlockAbility | undefined)[];
}

const AbilityIcon = ({
  ability,
  slot,
  className,
}: {
  ability?: DeadlockAbility;
  slot: number;
  className?: string;
}) => {
  const image = ability ? abilityImage(ability) : undefined;
  return (
    <div
      className={cn(
        "dl-notch-sm grid shrink-0 place-items-center border border-[rgb(var(--hero)/0.3)] bg-[rgb(var(--hero)/0.08)]",
        className,
      )}>
      {image ? (
        <img
          alt=''
          className='size-full object-contain p-1'
          loading='lazy'
          src={image}
        />
      ) : (
        <span className='font-mono text-[rgb(var(--hero))] text-xs'>
          {slot}
        </span>
      )}
    </div>
  );
};

/** Which point in the order buys each of an ability's three upgrades. */
const positionsBySlot = (steps: AbilityStep[]) => {
  const positions = new Map<number, number[]>();
  steps.forEach((step, index) => {
    const existing = positions.get(step.slot) ?? [];
    existing.push(index + 1);
    positions.set(step.slot, existing);
  });
  return positions;
};

export const AbilityPriority = ({ steps, abilities }: AbilityOrderProps) => {
  const positions = positionsBySlot(steps);
  const maxedFirst = [...positions.entries()].sort(
    (a, b) => (a[1][2] ?? 99) - (b[1][2] ?? 99),
  )[0]?.[0];

  return (
    <div className='space-y-2'>
      {Array.from({ length: ABILITY_SLOTS }, (_, index) => {
        const slot = index + 1;
        const ability = abilities[index];
        const slotPositions = positions.get(slot) ?? [];
        const isPriority = slot === maxedFirst;

        return (
          <div
            key={slot}
            className={cn(
              "dl-notch-sm flex items-center gap-3 border p-2.5",
              isPriority
                ? "border-[rgb(var(--hero)/0.45)] bg-[rgb(var(--hero)/0.07)]"
                : "border-border/60 bg-background-dark/50",
            )}>
            <AbilityIcon ability={ability} className='size-10' slot={slot} />
            <div className='min-w-0 flex-1'>
              <div className='flex items-baseline gap-2'>
                <span className='truncate font-medium text-dl-offwhite text-sm'>
                  {ability?.name ?? `Ability ${slot}`}
                </span>
                {slot === ULTIMATE_SLOT ? (
                  <span className='dl-label shrink-0 text-dl-gold/60'>Ult</span>
                ) : null}
              </div>
              <div className='mt-1 flex items-center gap-1'>
                {slotPositions.map((position, pipIndex) => (
                  <span
                    key={position}
                    className='font-mono text-[10px] text-muted-foreground/70 tabular-nums'
                    title={`Upgrade ${pipIndex + 1} at point ${position}`}>
                    {pipIndex > 0 ? "·" : null} {position}
                  </span>
                ))}
              </div>
            </div>
            {isPriority ? (
              <span className='dl-label shrink-0 text-[rgb(var(--hero))]'>
                Max first
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export const AbilityPointTrack = ({ steps, abilities }: AbilityOrderProps) => (
  <div className='dl-notch border border-[rgb(var(--hero)/0.18)] bg-background-dark/60 p-4'>
    <div className='grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12'>
      {steps.map((step, index) => (
        <div
          key={`${step.slot}-${step.step}`}
          className='animate-dl-rise flex flex-col items-center gap-1.5'
          style={{ animationDelay: `${index * 35}ms` }}>
          <span className='font-mono text-[10px] text-muted-foreground/50 tabular-nums'>
            {index + 1}
          </span>
          <AbilityIcon
            ability={abilities[step.slot - 1]}
            className='aspect-square w-full'
            slot={step.slot}
          />
          <span className='sr-only'>
            {abilities[step.slot - 1]?.name ?? `Ability ${step.slot}`}, upgrade{" "}
            {step.step}
          </span>
          <span className='font-mono text-[11px] text-[rgb(var(--hero))] tabular-nums'>
            +{step.apCost} AP
          </span>
          <span className='font-mono text-[10px] text-muted-foreground/45 tabular-nums'>
            {step.apSpent}
          </span>
        </div>
      ))}
    </div>
    <MicroLabel className='mt-3'>
      Upgrade number · ability · points spent · running total
    </MicroLabel>
  </div>
);
