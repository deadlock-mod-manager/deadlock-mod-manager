import {
  type DeadlockAbility,
  type DeadlockHero,
  heroAccent,
  heroImage,
  heroSlug,
  ITEM_CATEGORIES,
} from "@/lib/deadlock-assets";
import type { Roll } from "@/lib/randomizer/roll";
import { type Sections } from "@/lib/randomizer/sections";
import { cn } from "@/lib/utils";
import { Button } from "@deadlock-mods/ui/components/button";
import { Dices, ScrollText } from "@deadlock-mods/ui/icons";
import { Trans, useTranslation } from "react-i18next";
import { AbilityPriority, SkillTrack } from "./ability-order";
import { CopyLinkButton } from "./copy-link-button";
import { Fact } from "./fact";
import { HeroPicker } from "./hero-picker";
import { HeroWordmark } from "./hero-wordmark";
import { ItemCard } from "./item-card";
import {
  CATEGORY_BAR,
  CATEGORY_TEXT,
  MicroLabel,
  Panel,
  SectionHeading,
  useFormatSouls,
} from "./primitives";
import { SectionPicker } from "./section-picker";

export interface RandomizerViewProps {
  roll: Roll;
  heroes: DeadlockHero[];
  /** Slug of the hero rolls are locked to, straight from the URL. */
  lockedHero?: string;
  abilities: (DeadlockAbility | undefined)[];
  sections: Sections;
  onHeroChange: (slug: string | undefined) => void;
  onReroll: () => void;
  onSectionsChange: (sections: Sections) => void;
}

/** `--hero` drives every accent on the page, so it is typed rather than cast. */
interface HeroStyle extends React.CSSProperties {
  "--hero": string;
}

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const RandomizerView = ({
  roll,
  heroes,
  lockedHero,
  abilities,
  sections,
  onHeroChange,
  onReroll,
  onSectionsChange,
}: RandomizerViewProps) => {
  const { t } = useTranslation("tool-randomizer");
  const formatSouls = useFormatSouls();
  const { hero } = roll;
  const locked = heroes.find((entry) => heroSlug(entry) === lockedHero);
  const card = heroImage(hero, "card");
  const background = heroImage(hero, "background") ?? card;
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
          <HeroPicker heroes={heroes} locked={locked} onChange={onHeroChange} />
          <SectionPicker onChange={onSectionsChange} sections={sections} />
          <Button onClick={onReroll} size='sm'>
            <Dices className='size-4' />
            {t("toolbar.reroll")}
          </Button>
        </div>

        <h1 className='sr-only'>
          {hero.description.role
            ? t("hero.headingWithRole", {
                hero: hero.name,
                role: hero.description.role,
              })
            : t("hero.heading", { hero: hero.name })}
        </h1>

        <p
          aria-hidden='true'
          className='font-primary text-3xl text-dl-offwhite/80 md:text-4xl'>
          {t("hero.youArePlaying")}
        </p>
        <div aria-hidden='true' className='mt-2'>
          <HeroWordmark hero={hero} />
        </div>
        {hero.description.role ? (
          <p className='mt-3 font-primary text-2xl text-muted-foreground md:text-3xl'>
            {t("hero.role", { role: hero.description.role })}
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
                <MicroLabel className='mb-1'>
                  {t("facts.complexity")}
                </MicroLabel>
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
              <Fact label={t("facts.lane")}>
                <div className='font-primary text-2xl text-dl-offwhite'>
                  {t(`lanes.${roll.lane}`)}
                </div>
              </Fact>
              {hero.hero_type ? (
                <Fact label={t("facts.archetype")}>
                  <div className='font-primary text-2xl text-dl-offwhite'>
                    {titleCase(hero.hero_type)}
                  </div>
                </Fact>
              ) : null}
            </div>

            {tags.length > 0 || hero.gun_tag ? (
              <Fact label={t("facts.tags")}>
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
              <Fact label={t("facts.mandate")}>
                <div className='font-primary text-2xl text-[rgb(var(--hero))]'>
                  {t(`mandates.${roll.mandate}.label`)}
                </div>
                <p className='mt-1 text-muted-foreground text-sm leading-relaxed'>
                  {t(`mandates.${roll.mandate}.blurb`)}
                </p>
              </Fact>
            ) : null}

            {sections.build ? (
              <Fact label={t("facts.buildCost")}>
                <div className='mb-3 flex items-baseline gap-2'>
                  <span className='font-mono text-3xl text-dl-souls tabular-nums'>
                    {formatSouls(roll.totalSouls)}
                  </span>
                  <span className='text-muted-foreground text-sm'>
                    {t("facts.souls")}
                  </span>
                </div>
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
                            {t(`categories.${category}`)}
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
          </div>

          {sections.abilities ? (
            <div className='lg:col-span-5'>
              <Panel className='p-4'>
                <div className='mb-3 flex items-center justify-between'>
                  <MicroLabel>{t("facts.abilityPriority")}</MicroLabel>
                  <span className='dl-label text-muted-foreground/60'>
                    {t("facts.abilityPriorityHint")}
                  </span>
                </div>
                <AbilityPriority
                  abilities={abilities}
                  steps={roll.skillOrder}
                  unlockOrder={roll.unlockOrder}
                />
              </Panel>
            </div>
          ) : null}
        </div>

        {sections.build ? (
          <section className='mt-16'>
            <SectionHeading
              aside={
                <div className='text-right'>
                  <MicroLabel>{t("facts.total")}</MicroLabel>
                  <div className='font-mono text-dl-souls text-xl tabular-nums'>
                    {formatSouls(roll.totalSouls)}{" "}
                    <span className='text-muted-foreground text-sm'>
                      {t("facts.souls")}
                    </span>
                  </div>
                </div>
              }
              title={t("headings.build")}
            />
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
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
          </section>
        ) : null}

        {sections.abilities ? (
          <section className='mt-16'>
            <SectionHeading title={t("headings.skills")} />
            <SkillTrack abilities={abilities} steps={roll.skillOrder} />
          </section>
        ) : null}

        {sections.rules ? (
          <section className='mt-16'>
            <SectionHeading title={t("headings.rules")} />
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
                        {t(`challenges.${challenge.id}.title`)}
                      </h3>
                    </div>
                    <p className='mt-2 text-muted-foreground text-sm leading-relaxed'>
                      {t(`challenges.${challenge.id}.detail`)}
                    </p>
                  </Panel>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <footer className='mt-16 border-[rgb(var(--hero)/0.2)] border-t pt-5'>
          <p className='text-muted-foreground/60 text-xs'>
            <Trans
              components={{
                link: (
                  <a
                    className='text-[rgb(var(--hero))] hover:underline'
                    href='https://deadlock-api.com'
                    rel='noopener noreferrer'
                    target='_blank'
                  />
                ),
              }}
              i18nKey='footer.credit'
              t={t}
            />
          </p>
        </footer>
      </div>
    </div>
  );
};
