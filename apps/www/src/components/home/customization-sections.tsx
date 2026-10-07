import { cn } from "@deadlock-mods/ui/lib/utils";
import { DOCS_URL } from "@/lib/constants";
import { PREVIEW_MODS } from "./app-preview/mods";
import { CtaArrow, secondaryCta } from "./cta";
import { ModCard } from "./mod-card";

// Real community skins from the store snapshot, credited and linked to their pages.
const FEATURED_SKIN_IDS = new Set([
  "691863",
  "656006",
  "655209",
  "628313",
  "661996",
  "669234",
]);

const featuredSkins = PREVIEW_MODS.filter((mod) =>
  FEATURED_SKIN_IDS.has(mod.id),
);

export const SkinsSection = () => (
  <section className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
    <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'>
      <div>
        <h2 className='text-balance font-bold font-primary text-[clamp(32px,3.6vw,46px)] leading-[1.08]'>
          Hero skins from the community
        </h2>
        <p className='mt-4 max-w-[46ch] text-base text-muted-foreground leading-relaxed'>
          Pick a hero, check the skin in the 3D preview and apply it. Want to
          make your own? Import a model into the Mod Foundry. Skins are
          client-side only, so other players still see the default models.
        </p>
        <a
          href={`${DOCS_URL}/using-mod-manager/customization#hero-skins`}
          target='_blank'
          rel='noopener noreferrer'
          className={cn(secondaryCta("sm"), "mt-5")}>
          How hero skins work
          <CtaArrow />
        </a>
      </div>
      <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
        {featuredSkins.map((mod) => (
          <li key={mod.id}>
            <ModCard mod={mod} />
          </li>
        ))}
      </ul>
    </div>
  </section>
);
