import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  LuDownload,
  LuGlobe,
  LuLayoutGrid,
  LuRefreshCw,
  LuSettings,
} from "react-icons/lu";
import { RiOpenSourceFill } from "react-icons/ri";

type FeaturesProps = {
  icon: React.ElementType;
  titleKey: string;
  descriptionKey: string;
};

const featureList: FeaturesProps[] = [
  {
    icon: LuDownload,
    titleKey: "features.oneClickInstall.title",
    descriptionKey: "features.oneClickInstall.description",
  },
  {
    icon: LuSettings,
    titleKey: "features.manageWithConfidence.title",
    descriptionKey: "features.manageWithConfidence.description",
  },
  {
    icon: LuLayoutGrid,
    titleKey: "features.builtInBrowser.title",
    descriptionKey: "features.builtInBrowser.description",
  },
  {
    icon: LuGlobe,
    titleKey: "features.crossPlatform.title",
    descriptionKey: "features.crossPlatform.description",
  },
  {
    icon: RiOpenSourceFill,
    titleKey: "features.openSource.title",
    descriptionKey: "features.openSource.description",
  },
  {
    icon: LuRefreshCw,
    titleKey: "features.easyUpdates.title",
    descriptionKey: "features.easyUpdates.description",
  },
];

export const FeaturesSection = () => {
  const { t } = useTranslation();

  return (
    <section
      className='container relative mx-auto overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:py-32'
      id='features'>
      {/* Decorative Cogs */}
      <div className='pointer-events-none absolute inset-0'>
        {/* Top Right Small Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute top-4 right-4 h-20 w-20 animate-spin-slow text-primary/5 opacity-50 [animation-duration:20s] sm:top-8 sm:right-8 sm:h-24 sm:w-24 lg:top-12 lg:right-12 lg:h-28 lg:w-28'
        />

        {/* Bottom Left Wrench */}
        <PhosphorIcons.WrenchIcon
          weight='duotone'
          className='absolute bottom-8 left-4 h-18 w-18 rotate-90 text-primary/5 opacity-50 sm:bottom-12 sm:left-8 sm:h-24 sm:w-24 lg:bottom-16 lg:left-12'
        />
      </div>

      <h2 className='relative mb-2 text-center text-lg text-primary tracking-wider'>
        {t("features.sectionLabel")}
      </h2>

      <h2 className='relative mb-6 text-center font-bold font-primary text-3xl sm:mb-8 md:text-4xl'>
        {t("features.sectionTitle")}
      </h2>

      <div className='relative grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3'>
        {featureList.map(({ icon, titleKey, descriptionKey }) => (
          <Card
            className='h-full border-muted/50 bg-background/50 backdrop-blur-sm'
            key={titleKey}>
            <CardHeader className='flex items-center justify-center'>
              <div className='mb-4 rounded-full bg-primary/20 p-3 ring-8 ring-primary/10'>
                {React.createElement(icon, {
                  size: 48,
                  className: "text-primary",
                })}
              </div>

              <CardTitle>{t(titleKey)}</CardTitle>
            </CardHeader>

            <CardContent className='text-center text-muted-foreground'>
              {t(descriptionKey)}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
