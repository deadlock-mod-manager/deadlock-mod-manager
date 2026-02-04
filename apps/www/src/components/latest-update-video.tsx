import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import type React from "react";

interface LatestUpdateVideoSectionProps {
  videoId: string;
  label?: string;
  title?: string;
  description?: string;
}

export const LatestUpdateVideoSection: React.FC<
  LatestUpdateVideoSectionProps
> = ({
  videoId,
  label = "Latest Updates",
  title = "See What's New",
  description,
}) => {
  const embedUrl = `https://www.youtube.com/embed/${videoId}`;

  return (
    <section
      className='container relative mx-auto overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:py-32'
      id='latest-updates'>
      {/* Decorative Cogs */}
      <div className='pointer-events-none absolute inset-0'>
        {/* Top Left Small Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute top-4 left-4 h-20 w-20 animate-spin-slow text-primary/5 opacity-50 [animation-duration:15s] sm:top-8 sm:left-8 sm:h-24 sm:w-24 lg:top-12 lg:left-12 lg:h-28 lg:w-28'
        />

        {/* Bottom Right Wrench */}
        <PhosphorIcons.WrenchIcon
          weight='duotone'
          className='absolute bottom-8 right-4 h-20 w-20 rotate-45 text-primary/5 opacity-50 sm:bottom-12 sm:right-8 sm:h-24 sm:w-24 lg:bottom-16 lg:right-12'
        />

        {/* Bottom Left Small Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute bottom-16 left-12 h-16 w-16 animate-spin-slow text-primary/5 opacity-50 [animation-duration:12s] [animation-direction:reverse] sm:bottom-20 sm:left-16 sm:h-20 sm:w-20 lg:bottom-24 lg:left-24'
        />
      </div>

      <h2 className='relative mb-2 text-center text-lg text-primary tracking-wider'>
        {label}
      </h2>

      <h2 className='relative mb-6 text-center font-bold font-primary text-3xl sm:mb-8 md:text-4xl'>
        {title}
      </h2>

      {description && (
        <p className='relative mb-6 text-center text-base text-muted-foreground sm:mb-8 sm:text-lg'>
          {description}
        </p>
      )}

      <div className='relative mx-auto max-w-4xl'>
        <div className='relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted/30 shadow-lg ring-1 ring-border ring-inset'>
          <iframe
            src={embedUrl}
            title={title || label}
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            allowFullScreen
            className='absolute inset-0 h-full w-full'
            loading='lazy'
            sandbox='allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
          />
        </div>
      </div>
    </section>
  );
};
