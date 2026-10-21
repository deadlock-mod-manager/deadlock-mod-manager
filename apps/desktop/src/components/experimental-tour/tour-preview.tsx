import { CompassIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { TourFeature } from "@/lib/experimental-tour";

const ICONS = {
  "custom-maps": CompassIcon,
};

export const TourPreview = ({ feature }: { feature: TourFeature }) => {
  const { t } = useTranslation();
  const Icon = ICONS[feature];
  return (
    <div className='relative flex min-h-64 flex-col justify-between overflow-hidden bg-background p-6 md:p-8'>
      <img
        src='/backgrounds/bg-2.jpg'
        alt=''
        className='absolute inset-0 h-full w-full object-cover opacity-20'
      />
      <span className='relative text-xs uppercase tracking-widest text-muted-foreground'>
        {t("experimentalTour.preview")}
      </span>
      <div
        key={feature}
        className='relative py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200'>
        <Icon
          aria-hidden
          className='mb-6 size-20 text-primary'
          weight='duotone'
        />
        <p className='max-w-xs text-2xl font-semibold'>
          {t(`experimentalTour.features.${feature}.previewTitle`)}
        </p>
        <p className='mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground'>
          {t(`experimentalTour.features.${feature}.previewDetail`)}
        </p>
      </div>
      <div aria-hidden className='relative flex items-center gap-2'>
        <span className='h-px w-8 bg-primary/50' />
        <span className='size-1 rotate-45 bg-primary' />
        <span className='h-px w-8 bg-primary/50' />
      </div>
    </div>
  );
};
