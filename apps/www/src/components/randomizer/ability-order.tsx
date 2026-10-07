import { LockOpen } from "@deadlock-mods/ui/icons";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  abilityImage,
  type DeadlockAbility,
  ULTIMATE_SLOT,
} from "@/lib/deadlock-assets";
import type { SkillStep } from "@/lib/randomizer/roll";
import { cn } from "@/lib/utils";

interface AbilityOrderProps {
  steps: SkillStep[];
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

const abilityName = (
  t: TFunction<"tool-randomizer">,
  abilities: (DeadlockAbility | undefined)[],
  slot: number,
): string => abilities[slot - 1]?.name ?? t("abilities.fallback", { slot });

/** Where in the skill order each of an ability's four steps comes. */
const positionsBySlot = (steps: SkillStep[]) => {
  const positions = new Map<number, number[]>();
  steps.forEach((step, index) => {
    const existing = positions.get(step.slot) ?? [];
    existing.push(index + 1);
    positions.set(step.slot, existing);
  });
  return positions;
};

const stepLabel = (t: TFunction<"tool-randomizer">, step: SkillStep): string =>
  step.kind === "unlock"
    ? t("abilities.unlock")
    : t("abilities.cost", { cost: step.apCost });

export const AbilityPriority = ({
  steps,
  abilities,
  unlockOrder,
}: AbilityOrderProps & { unlockOrder: number[] }) => {
  const { t } = useTranslation("tool-randomizer");
  const positions = positionsBySlot(steps);
  const maxedFirst = [...positions.entries()].sort(
    (a, b) => (a[1].at(-1) ?? 99) - (b[1].at(-1) ?? 99),
  )[0]?.[0];

  return (
    <div className='space-y-2'>
      {unlockOrder.map((slot) => {
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
            <AbilityIcon
              ability={abilities[slot - 1]}
              className='size-10'
              slot={slot}
            />
            <div className='min-w-0 flex-1'>
              <div className='flex items-baseline gap-2'>
                <span className='truncate font-medium text-dl-offwhite text-sm'>
                  {abilityName(t, abilities, slot)}
                </span>
                {slot === ULTIMATE_SLOT ? (
                  <span className='dl-label shrink-0 text-dl-gold/60'>
                    {t("abilities.ultimate")}
                  </span>
                ) : null}
                {isPriority ? (
                  <span className='dl-label ml-auto shrink-0 text-[rgb(var(--hero))]'>
                    {t("abilities.maxFirst")}
                  </span>
                ) : null}
              </div>
              <div className='mt-1.5 flex items-center gap-1'>
                {slotPositions.map((position, index) => (
                  <span
                    key={position}
                    className={cn(
                      "grid h-5 min-w-7 place-items-center px-1 font-mono text-[10px] tabular-nums",
                      index === 0
                        ? "border border-dl-gold/40 border-dashed text-dl-gold/80"
                        : "bg-[rgb(var(--hero)/0.12)] text-dl-offwhite/80",
                    )}
                    title={
                      index === 0
                        ? t("abilities.unlockedAt", { position })
                        : t("abilities.upgradeAt", { upgrade: index, position })
                    }>
                    {position}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const SkillTrack = ({ steps, abilities }: AbilityOrderProps) => {
  const { t } = useTranslation("tool-randomizer");

  return (
    <div className='dl-notch border border-[rgb(var(--hero)/0.18)] bg-background-dark/60 p-4'>
      <div className='grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-16'>
        {steps.map((step, index) => {
          const isUnlock = step.kind === "unlock";
          return (
            <div
              key={`${step.slot}-${step.kind === "unlock" ? 0 : step.step}`}
              className='animate-dl-rise flex flex-col items-center gap-1.5'
              style={{ animationDelay: `${index * 35}ms` }}>
              <span className='font-mono text-[10px] text-muted-foreground/50 tabular-nums'>
                {index + 1}
              </span>
              <div className='relative w-full'>
                <AbilityIcon
                  ability={abilities[step.slot - 1]}
                  className={cn(
                    "aspect-square w-full",
                    isUnlock && "border-dl-gold/50 border-dashed bg-dl-gold/5",
                  )}
                  slot={step.slot}
                />
                {isUnlock ? (
                  <LockOpen
                    aria-hidden='true'
                    className='absolute -top-1 -right-1 size-3.5 text-dl-gold'
                  />
                ) : null}
              </div>
              <span className='sr-only'>
                {isUnlock
                  ? t("abilities.srUnlock", {
                      ability: abilityName(t, abilities, step.slot),
                    })
                  : t("abilities.srUpgrade", {
                      ability: abilityName(t, abilities, step.slot),
                      step: step.step,
                    })}
              </span>
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums",
                  isUnlock ? "text-dl-gold/90" : "text-[rgb(var(--hero))]",
                )}>
                {stepLabel(t, step)}
              </span>
              <span className='font-mono text-[10px] text-muted-foreground/45 tabular-nums'>
                {isUnlock ? "–" : t("abilities.spent", { spent: step.apSpent })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
