import { useTranslation } from "react-i18next";
import { AppPreview } from "./app-preview";
import { SectionHeading } from "./section-heading";

// Phones get readable crops of the same app instead of a shrunken preview.
const SLIDES = [
  {
    id: "find",
    src: "/home/app/slide-find.webp",
    width: 999,
    height: 890,
  },
  {
    id: "launch",
    src: "/home/app/slide-launch.webp",
    width: 880,
    height: 704,
  },
  {
    id: "theme",
    src: "/home/app/slide-theme.webp",
    width: 1040,
    height: 807,
  },
] as const;

export const FeatureTour = () => {
  const { t } = useTranslation("home");

  return (
    <section
      id='tour'
      className='mx-auto max-w-7xl scroll-mt-6 px-6 pt-20 pb-10 lg:pt-28'>
      <SectionHeading
        eyebrow={t("tour.eyebrow")}
        title={t("tour.title")}
        description={t("tour.description")}
      />
      <div className='mt-10 hidden rounded-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:block'>
        <AppPreview />
      </div>

      <ul
        aria-label={t("tour.slidesLabel")}
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
                <span className='block font-semibold'>
                  {t(`tour.slides.${slide.id}.title`)}
                </span>
                <span className='mt-1 block text-muted-foreground text-sm leading-relaxed'>
                  {t(`tour.slides.${slide.id}.body`)}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className='mt-4 text-foreground-subtle text-xs md:hidden'>
        {t("tour.mobileNote")}
      </p>
    </section>
  );
};
