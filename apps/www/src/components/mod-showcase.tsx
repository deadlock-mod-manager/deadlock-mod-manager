import type { ModDto } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ModCard } from "@/components/mod-card";
import { ModPreview } from "@/components/mod-preview";
import { orpc } from "@/utils/orpc";

export const ModShowcaseSection = () => {
  const { t } = useTranslation();
  const [selectedMod, setSelectedMod] = React.useState<string | null>(null);
  const modsQuery = useQuery(orpc.listModsV2.queryOptions());
  const mods = useMemo(
    () =>
      (modsQuery.data || [])
        .sort((a, b) => b.downloadCount - a.downloadCount)
        .slice(0, 4),
    [modsQuery.data],
  );

  React.useEffect(() => {
    if (mods.length > 0 && !selectedMod) {
      setSelectedMod(mods[0].id);
    }
  }, [mods, selectedMod]);
  const selectedModData = mods.find((mod) => mod.id === selectedMod);

  return (
    <section
      className='gear-pattern relative overflow-hidden py-16 sm:py-24 lg:py-32 flex flex-col items-center justify-center'
      id='showcase'>
      {/* Decorative Cogs and Wrenches */}
      <div className='pointer-events-none absolute inset-0'>
        {/* Left Side Wrench */}
        <PhosphorIcons.WrenchIcon
          weight='duotone'
          className='absolute top-24 left-4 h-24 w-24 -rotate-12 text-primary/5 opacity-50 sm:top-32 sm:left-8 sm:h-28 sm:w-28 lg:top-40 lg:left-12 lg:h-32 lg:w-32'
        />

        {/* Right Side Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute top-48 right-4 h-28 w-28 animate-spin-slow text-primary/5 opacity-50 [animation-duration:15s] sm:top-56 sm:right-8 sm:h-36 sm:w-36 lg:top-64 lg:right-12 lg:h-40 lg:w-40'
        />

        {/* Bottom Center Small Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute bottom-12 left-1/4 h-14 w-14 animate-spin-slow text-primary/5 opacity-50 [animation-direction:reverse] [animation-duration:10s] sm:bottom-16 sm:h-16 sm:w-16 lg:bottom-20'
        />
      </div>

      <div className='container relative mx-auto px-4 sm:px-6 lg:px-8'>
        <div className='mx-auto mb-12 max-w-3xl text-center sm:mb-16'>
          <h2 className='mb-2 text-center text-base text-primary tracking-wider sm:text-lg'>
            {t("showcase.sectionLabel")}
          </h2>
          <h2 className='mb-4 font-bold font-primary text-2xl sm:mb-6 sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl'>
            <span className='text-foreground'>
              {t("showcase.sectionTitle1")}
            </span>
            <br />
            <span className='deadlock-text-gradient'>
              {t("showcase.sectionTitle2")}
            </span>
          </h2>

          <p className='text-sm text-muted-foreground leading-relaxed sm:text-base lg:text-lg xl:text-xl'>
            {t("showcase.sectionDescription")}
          </p>

          <div className='deadlock-gradient-primary mx-auto mt-6 h-1 w-24 rounded-full' />
        </div>
        <div className='grid gap-6 overflow-hidden lg:grid-cols-2 lg:gap-12'>
          <div className='min-w-0 space-y-3 sm:space-y-4'>
            <h3 className='mb-4 flex items-center gap-2 font-semibold text-base sm:mb-6 sm:text-lg lg:text-xl'>
              {t("showcase.popularMods")}
            </h3>

            {mods.map((mod) => (
              <ModCard
                isSelected={selectedMod === mod.id}
                key={mod.id}
                mod={mod as ModDto}
                onClick={() => setSelectedMod(mod.id)}
              />
            ))}
          </div>

          <div className='min-w-0 lg:sticky lg:top-8 lg:self-start'>
            <ModPreview selectedMod={(selectedModData as ModDto) || null} />
          </div>
        </div>
        <div className='mt-8 mx-auto w-full flex justify-center'>
          <Link to='/mods'>
            <Button size='lg' className='px-8'>
              {t("showcase.browseAllMods")} <span aria-hidden='true'>→</span>
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};
