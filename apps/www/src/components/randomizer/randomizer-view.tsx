import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Check,
  ChevronDown,
  Dices,
  Link2,
  ScrollText,
  SlidersHorizontal,
  X,
} from "@deadlock-mods/ui/icons";
import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  type DeadlockAbility,
  type DeadlockHero,
  heroAccent,
  heroImage,
  ITEM_CATEGORIES,
} from "@/lib/deadlock-assets";
import type { Roll } from "@/lib/randomizer/roll";
import {
  SECTION_KEYS,
  SECTION_LABELS,
  type Sections,
} from "@/lib/randomizer/sections";
import { cn } from "@/lib/utils";
import { AbilityPointTrack, AbilityPriority } from "./ability-order";
import { ItemCard } from "./item-card";
import {
  CATEGORY_BAR,
  CATEGORY_TEXT,
  formatSouls,
  MicroLabel,
  Panel,
  SectionHeading,
} from "./primitives";

interface RandomizerViewProps {
  roll: Roll;
  abilities: (DeadlockAbility | undefined)[];
  sections: Sections;
  onReroll: () => void;
  onSectionsChange: (sections: Sections) => void;
}

/** `--hero` drives every accent on the page, so it is typed rather than cast. */
interface HeroStyle extends React.CSSProperties {
  "--hero": string;
}

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

const COPY_FEEDBACK_MS = 2000;

const CopyLinkButton = () => {
  // The clipboard is a permission the browser can refuse, so the button says
  // which of the two happened rather than silently claiming success.
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  const flash = (next: "copied" | "failed") => {
    setResult(next);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setResult("idle"), COPY_FEEDBACK_MS);
  };

  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => flash("copied"),
      () => flash("failed"),
    );
  };

  const icon = {
    idle: <Link2 className='size-4' />,
    copied: <Check className='size-4' />,
    failed: <X className='size-4' />,
  }[result];
  const label = { idle: "Copy link", copied: "Copied", failed: "Copy failed" }[
    result
  ];

  return (
    <Button onClick={copy} size='sm' variant='outline'>
      {icon}
      <span aria-live='polite'>{label}</span>
    </Button>
  );
};

/**
 * The hero's own wordmark, painted in the hero's colour. The SVG ships as white
 * artwork, so it is used as a mask over an accent fill; the hidden image behind
 * it is what gives the block its natural aspect ratio.
 */
export const HeroWordmark = ({ hero }: { hero: DeadlockHero }) => {
  const source = heroImage(hero, "name");
  const [failedSource, setFailedSource] = useState<string | null>(null);

  if (!source || failedSource === source) {
    return (
      <span className='font-bold font-primary text-[rgb(var(--hero))] text-5xl italic md:text-7xl'>
        {hero.name}
      </span>
    );
  }

  return (
    <span className='relative inline-block h-14 md:h-20'>
      <img
        alt=''
        aria-hidden='true'
        className='h-full w-auto opacity-0'
        crossOrigin='anonymous'
        onError={() => setFailedSource(source)}
        src={source}
      />
      <span
        aria-hidden='true'
        className='absolute inset-0 bg-[rgb(var(--hero))]'
        style={{
          maskImage: `url(${source})`,
          maskRepeat: "no-repeat",
          maskSize: "contain",
          maskPosition: "left center",
          WebkitMaskImage: `url(${source})`,
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          WebkitMaskPosition: "left center",
        }}
      />
    </span>
  );
};

const SectionPicker = ({
  sections,
  onChange,
}: {
  sections: Sections;
  onChange: (sections: Sections) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size='sm' variant='outline'>
        <SlidersHorizontal className='size-4' />
        Sections
        <ChevronDown className='size-3.5 opacity-60' />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align='end' className='w-52'>
      <DropdownMenuLabel>Roll me</DropdownMenuLabel>
      <DropdownMenuSeparator />
      {SECTION_KEYS.map((key) => (
        <DropdownMenuCheckboxItem
          key={key}
          checked={sections[key]}
          onCheckedChange={(checked) =>
            onChange({ ...sections, [key]: checked === true })
          }
          onSelect={(event) => event.preventDefault()}>
          {SECTION_LABELS[key]}
        </DropdownMenuCheckboxItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const Fact = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <MicroLabel className='mb-2'>{label}</MicroLabel>
    {children}
  </div>
);

export const RandomizerView = ({
  roll,
  abilities,
  sections,
  onReroll,
  onSectionsChange,
}: RandomizerViewProps) => {
  const { hero } = roll;
  const card = heroImage(hero, "card");
  const background = heroImage(hero, "background") ?? card;
  const firstBuy = roll.build[0];
  const tags = hero.tags ?? [];

  const heroStyle: HeroStyle = { "--hero": heroAccent(hero) };

  return (
    <div className='relative' style={heroStyle}>
      <div
        aria-hidden='true'
        className='dl-grain pointer-events-none absolute inset-x-0 top-0 h-[680px] overflow-hidden'>
        {background ? (
          <img
            alt=''
            className='size-full scale-105 object-cover object-top opacity-25'
            src={background}
          />
        ) : null}
        <div className='absolute inset-0 bg-gradient-to-b from-[rgb(var(--hero)/0.14)] via-background/85 to-background' />
      </div>

      <div className='container relative mx-auto px-4 py-10'>
        <div className='mb-6 flex flex-wrap items-center justify-end gap-2 md:absolute md:top-10 md:right-4 md:mb-0'>
          <CopyLinkButton />
          <SectionPicker onChange={onSectionsChange} sections={sections} />
          <Button onClick={onReroll} size='sm'>
            <Dices className='size-4' />
            Reroll
          </Button>
        </div>

        <h1 className='sr-only'>
          You are playing {hero.name}
          {hero.description.role ? `, ${hero.description.role}` : null}
        </h1>

        <p
          aria-hidden='true'
          className='font-primary text-3xl text-dl-offwhite/80 md:text-4xl'>
          You are playing
        </p>
        <div aria-hidden='true' className='mt-2'>
          <HeroWordmark hero={hero} />
        </div>
        {hero.description.role ? (
          <p className='mt-3 font-primary text-2xl text-muted-foreground md:text-3xl'>
            {hero.description.role}.
          </p>
        ) : null}

        <div className='mt-10 grid gap-6 lg:grid-cols-12'>
          <div className='lg:col-span-3'>
            <Panel className='relative aspect-[3/4] overflow-hidden'>
              {card ? (
                <img
                  alt={hero.name}
                  className='size-full object-cover object-top'
                  src={card}
                />
              ) : null}
              <div className='absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent' />
              <div className='absolute inset-x-0 bottom-0 p-4'>
                <MicroLabel className='mb-1'>Complexity</MicroLabel>
                <div className='flex gap-1'>
                  {[1, 2, 3].map((level) => (
                    <span
                      key={level}
                      className={cn(
                        "h-1 w-8",
                        level <= hero.complexity
                          ? "bg-[rgb(var(--hero))]"
                          : "bg-muted-foreground/25",
                      )}
                    />
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <div
            className={cn(
              "space-y-5",
              sections.abilities ? "lg:col-span-4" : "lg:col-span-9",
            )}>
            <div className='grid grid-cols-2 gap-5'>
              <Fact label='Lane'>
                <div className='font-primary text-2xl text-dl-offwhite'>
                  {roll.lane}
                </div>
              </Fact>
              {hero.hero_type ? (
                <Fact label='Archetype'>
                  <div className='font-primary text-2xl text-dl-offwhite'>
                    {titleCase(hero.hero_type)}
                  </div>
                </Fact>
              ) : null}
            </div>

            {tags.length > 0 || hero.gun_tag ? (
              <Fact label='Tags'>
                <div className='flex flex-wrap gap-2'>
                  {hero.gun_tag ? (
                    <span className='dl-notch-sm border border-dl-weapon/40 bg-dl-weapon/10 px-3 py-1 text-dl-weapon text-xs'>
                      {hero.gun_tag}
                    </span>
                  ) : null}
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className='dl-notch-sm border border-[rgb(var(--hero)/0.3)] px-3 py-1 text-dl-offwhite/80 text-xs'>
                      {tag}
                    </span>
                  ))}
                </div>
              </Fact>
            ) : null}

            {/* The mandate describes how the build spends its souls, so it
                only means anything while the build is on screen. */}
            {sections.build ? (
              <Fact label='Mandate'>
                <div className='font-primary text-2xl text-[rgb(var(--hero))]'>
                  {roll.mandate.label}
                </div>
                <p className='mt-1 text-muted-foreground text-sm leading-relaxed'>
                  {roll.mandate.blurb}
                </p>
              </Fact>
            ) : null}

            {sections.build ? (
              <Fact label='Souls by category'>
                <div className='space-y-2'>
                  {ITEM_CATEGORIES.map((category) => {
                    const souls = roll.soulsByCategory[category];
                    const share = roll.totalSouls
                      ? (souls / roll.totalSouls) * 100
                      : 0;
                    return (
                      <div key={category}>
                        <div className='flex items-baseline justify-between text-xs'>
                          <span className={CATEGORY_TEXT[category]}>
                            {CATEGORY_LABELS[category]}
                          </span>
                          <span className='font-mono text-muted-foreground tabular-nums'>
                            {formatSouls(souls)}
                          </span>
                        </div>
                        <div className='mt-1 h-1 bg-muted-foreground/15'>
                          <div
                            className={cn("h-full", CATEGORY_BAR[category])}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Fact>
            ) : null}

            {sections.build && firstBuy ? (
              <Fact label='Open with'>
                <ItemCard entry={firstBuy} order={1} />
              </Fact>
            ) : null}
          </div>

          {sections.abilities ? (
            <div className='lg:col-span-5'>
              <Panel className='p-4'>
                <div className='mb-3 flex items-center justify-between'>
                  <MicroLabel>Ability priority</MicroLabel>
                  <span className='dl-label text-muted-foreground/60'>
                    32 points
                  </span>
                </div>
                <AbilityPriority
                  abilities={abilities}
                  steps={roll.abilityOrder}
                />
                <p className='mt-3 text-[11px] text-muted-foreground/70 leading-relaxed'>
                  Numbers are the order you spend points in. Each ability takes
                  1, 2 and 5 points for its three upgrades.
                </p>
              </Panel>
            </div>
          ) : null}
        </div>

        {sections.build ? (
          <section className='mt-16'>
            <SectionHeading
              aside={
                <span>
                  Exact sequence · no substitutions ·{" "}
                  <span className='font-mono text-dl-souls tabular-nums'>
                    {formatSouls(roll.totalSouls)}
                  </span>{" "}
                  souls
                </span>
              }
              title='Build, in order.'
            />
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {roll.build.map((entry, index) => (
                <ItemCard
                  key={entry.item.class_name}
                  entry={entry}
                  imbueTarget={
                    entry.imbueSlot ? abilities[entry.imbueSlot - 1] : undefined
                  }
                  order={index + 1}
                />
              ))}
            </div>
            <p className='mt-3 text-[11px] text-muted-foreground/60'>
              Drawn from the {roll.draftPoolSize} shop items {hero.name}
              actually drafts, never pairing an item with a component it already
              contains.
            </p>
          </section>
        ) : null}

        {sections.abilities ? (
          <section className='mt-16'>
            <SectionHeading
              aside='Spend each point exactly as shown'
              title='Ability points, 1–32.'
            />
            <AbilityPointTrack
              abilities={abilities}
              steps={roll.abilityOrder}
            />
          </section>
        ) : null}

        {sections.rules ? (
          <section className='mt-16'>
            <SectionHeading
              aside='Break one and the roll does not count'
              title='The rules.'
            />
            <div className='grid gap-3 md:grid-cols-3'>
              {roll.challenges.map((challenge, index) => (
                <div
                  key={challenge.id}
                  className='animate-dl-rise'
                  style={{ animationDelay: `${index * 60}ms` }}>
                  <Panel className='h-full p-4'>
                    <div className='flex items-center gap-2'>
                      <ScrollText className='size-4 shrink-0 text-[rgb(var(--hero))]' />
                      <h3 className='font-primary font-bold text-dl-offwhite text-lg'>
                        {challenge.title}
                      </h3>
                    </div>
                    <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                      {challenge.detail}
                    </p>
                  </Panel>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className='mt-16 border-[rgb(var(--hero)/0.2)] border-t pt-5'>
          <p className='text-muted-foreground/60 text-xs'>
            Heroes, items and artwork provided by{" "}
            <a
              className='text-[rgb(var(--hero))] hover:underline'
              href='https://deadlock-api.com'
              rel='noopener noreferrer'
              target='_blank'>
              Deadlock API
            </a>
            .
          </p>
        </footer>
      </div>
    </div>
  );
};
