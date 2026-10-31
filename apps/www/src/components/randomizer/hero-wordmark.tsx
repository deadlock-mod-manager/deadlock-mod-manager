import { type DeadlockHero, heroImage } from "@/lib/deadlock-assets";
import { useState } from "react";

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
