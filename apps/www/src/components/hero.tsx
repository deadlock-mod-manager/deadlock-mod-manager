import { Button } from "@deadlock-mods/ui/components/button";
import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { PlatformDownloadButton } from "@/components/downloads/platform-download-button";
import { GITHUB_REPO } from "@/lib/constants";

export const HeroSection: React.FC<{ version: string }> = ({ version }) => {
  return (
    <div className='relative isolate overflow-hidden bg-background'>
      <svg
        aria-hidden='true'
        className='absolute inset-0 -z-10 size-full stroke-border/20'>
        <defs>
          <pattern
            x='50%'
            y={-1}
            id='hero-pattern'
            width={200}
            height={200}
            patternUnits='userSpaceOnUse'>
            <path d='M.5 200V.5H200' fill='none' />
          </pattern>
        </defs>
        <rect
          fill='url(#hero-pattern)'
          width='100%'
          height='100%'
          strokeWidth={0}
        />
      </svg>

      {/* Decorative Cogs and Wrenches */}
      <div className='pointer-events-none absolute inset-0 -z-10'>
        {/* Top Left Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute top-4 left-4 h-24 w-24 animate-spin-slow text-primary/5 opacity-50 sm:top-8 sm:left-8 sm:h-32 sm:w-32 lg:top-12 lg:left-12 lg:h-40 lg:w-40'
        />

        {/* Top Right Wrench */}
        <PhosphorIcons.WrenchIcon
          weight='duotone'
          className='absolute top-8 right-8 h-20 w-20 rotate-45 text-primary/5 opacity-50 sm:top-12 sm:right-16 sm:h-24 sm:w-24 lg:top-16 lg:right-24 lg:h-28 lg:w-28'
        />

        {/* Bottom Right Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute bottom-8 right-8 h-32 w-32 animate-spin-slow text-primary/5 opacity-50 [animation-direction:reverse] [animation-duration:12s] sm:bottom-12 sm:right-12 sm:h-40 sm:w-40 lg:bottom-16 lg:right-16 lg:h-48 lg:w-48'
        />

        {/* Bottom Left Small Cog */}
        <PhosphorIcons.GearIcon
          weight='duotone'
          className='absolute bottom-32 left-12 h-16 w-16 animate-spin-slow text-primary/5 opacity-50 [animation-duration:8s] sm:bottom-40 sm:left-16 sm:h-20 sm:w-20 lg:bottom-48 lg:left-24'
        />
      </div>
      <div className='mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10 sm:pb-24 lg:flex lg:px-8 lg:py-40'>
        <div className='mx-auto max-w-2xl lg:mx-0 lg:shrink-0 lg:pt-8'>
          <div className='mt-16 sm:mt-24 lg:mt-16'>
            <a
              href={`${GITHUB_REPO}/releases/tag/v${version}`}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex flex-wrap items-center gap-x-6 gap-y-2'>
              <span className='rounded-full bg-primary/10 px-3 py-1 text-sm/6 font-semibold text-primary ring-1 ring-primary/20 ring-inset'>
                v{version}
              </span>
              <span className='inline-flex items-center space-x-2 text-sm/6 font-medium text-muted-foreground'>
                <span>View Release Notes</span>
                <span aria-hidden='true'>→</span>
              </span>
            </a>
          </div>
          <h1 className='mt-8 text-4xl font-semibold tracking-tight text-balance font-primary sm:text-5xl lg:text-7xl'>
            <span className='bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text text-transparent'>
              Deadlock Mod Manager
            </span>
          </h1>
          <p className='mt-6 text-base font-medium text-pretty text-muted-foreground sm:mt-8 sm:text-lg lg:text-xl/8'>
            Mods for Deadlock, minus the hassle. Find, install, and update mods
            in a couple of clicks. No folders, no guesswork.
          </p>
          <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-x-6'>
            <PlatformDownloadButton className='px-4 w-full sm:w-auto' />
            <Link to='/download'>
              <Button
                className='px-4 w-full sm:w-auto'
                size='lg'
                variant='ghost'>
                All Downloads <span aria-hidden='true'>→</span>
              </Button>
            </Link>
          </div>
        </div>
        <div className='mx-auto mt-12 flex max-w-2xl sm:mt-16 lg:mt-0 lg:mr-0 lg:ml-10 lg:max-w-none lg:flex-none xl:ml-32'>
          <div className='w-full max-w-3xl flex-none sm:max-w-5xl lg:max-w-none'>
            <div className='-m-2 rounded-xl bg-muted/30 p-2 ring-1 ring-border ring-inset lg:-m-4 lg:rounded-2xl lg:p-4'>
              <div className='relative'>
                <div className='lg:-top-8 -translate-x-1/2 absolute top-2 left-1/2 mx-auto h-24 w-[90%] transform rounded-full bg-[#efe0be]/10 blur-3xl lg:h-80' />
                <img
                  alt='Deadlock Mod Manager screenshot'
                  src='/mods.png'
                  width={2432}
                  height={1442}
                  className='relative w-full rounded-md shadow-2xl ring-1 ring-border'
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
