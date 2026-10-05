import { cn } from "@deadlock-mods/ui/lib/utils";
import { DOCS_URL } from "@/lib/constants";
import {
  heroIcon,
  modThumbnail,
  modUrl,
  PREVIEW_MODS,
} from "./app-preview/mods";
import { CtaArrow, secondaryCta } from "./cta";

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
            <a
              href={modUrl(mod)}
              target='_blank'
              rel='noopener noreferrer'
              className='group block overflow-hidden rounded-xl border border-border bg-surface hover:border-border-hover focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2'>
              <span className='block overflow-hidden'>
                <img
                  src={modThumbnail(mod)}
                  alt=''
                  width={480}
                  height={360}
                  loading='lazy'
                  className='aspect-[4/3] w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]'
                />
              </span>
              <span className='flex items-start gap-2.5 p-3'>
                {mod.hero && (
                  <img
                    src={heroIcon(mod.hero)}
                    alt=''
                    width={28}
                    height={28}
                    loading='lazy'
                    className='size-7 shrink-0 rounded-full bg-background'
                  />
                )}
                <span className='min-w-0'>
                  <span className='block truncate font-semibold text-sm'>
                    {mod.name}
                  </span>
                  <span className='block truncate text-muted-foreground text-xs'>
                    {mod.hero} skin by {mod.author}
                  </span>
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  </section>
);
