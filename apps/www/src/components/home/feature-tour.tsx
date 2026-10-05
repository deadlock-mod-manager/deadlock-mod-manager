import { AppPreview } from "./app-preview";
import { SectionHeading } from "./section-heading";

// Phones get readable crops of the same app instead of a shrunken preview.
const SLIDES = [
  {
    src: "/home/app/slide-find.webp",
    width: 999,
    height: 890,
    title: "Find a mod",
    body: "Search the store, filter by hero and install with one click.",
  },
  {
    src: "/home/app/slide-launch.webp",
    width: 880,
    height: 704,
    title: "Launch modded",
    body: "Hit Launch Modded and the app applies your mods before the game starts.",
  },
  {
    src: "/home/app/slide-theme.webp",
    width: 1040,
    height: 807,
    title: "Make it yours",
    body: "Set a skin for each hero and pick a theme for the app.",
  },
];

export const FeatureTour = () => (
  <section
    id='tour'
    className='mx-auto max-w-7xl scroll-mt-6 px-6 pt-20 pb-10 lg:pt-28'>
    <SectionHeading
      eyebrow='Live preview'
      title='Try it before you download'
      description='This is a working copy of the app, right here on the page. Install a mod, change the theme or set up a crosshair.'
    />
    <div className='mt-10 hidden rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:block'>
      <AppPreview />
    </div>

    <ul
      aria-label='How the app works'
      className='-mx-6 mt-8 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:hidden'>
      {SLIDES.map((slide) => (
        <li key={slide.src} className='w-[82%] shrink-0 snap-start'>
          <figure>
            <img
              src={slide.src}
              alt=''
              width={slide.width}
              height={slide.height}
              loading='lazy'
              className='aspect-[5/4] w-full rounded-xl border border-white/10 bg-background object-cover object-top-left'
            />
            <figcaption className='mt-3'>
              <span className='block font-semibold'>{slide.title}</span>
              <span className='mt-1 block text-muted-foreground text-sm leading-relaxed'>
                {slide.body}
              </span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
    <p className='mt-4 text-foreground-subtle text-xs md:hidden'>
      On a PC you can click through the live preview right here.
    </p>
  </section>
);
