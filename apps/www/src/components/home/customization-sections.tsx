import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
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

export const SkinsSection = () => {
  const { t } = useTranslation("home");

  return (
    <section className='mx-auto max-w-7xl px-6 pt-20 pb-10'>
      <div className='grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]'>
        <div>
          <h2 className='text-balance font-bold font-primary text-[clamp(32px,3.6vw,46px)] leading-[1.08]'>
            {t("skins.title")}
          </h2>
          <p className='mt-4 max-w-[46ch] text-base text-muted-foreground leading-relaxed'>
            {t("skins.body")}
          </p>
          <a
            href={`${DOCS_URL}/using-mod-manager/customization#hero-skins`}
            target='_blank'
            rel='noopener noreferrer'
            className={cn(secondaryCta("sm"), "mt-5")}>
            {t("skins.link")}
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
};
