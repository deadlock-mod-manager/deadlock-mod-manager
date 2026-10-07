import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { PARTNERS } from "@/lib/constants";

const PartnerList = ({ duplicate = false }: { duplicate?: boolean }) => (
  <ul
    aria-hidden={duplicate || undefined}
    className={cn(
      "flex shrink-0 items-center gap-14 pr-14 motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:gap-y-5",
      duplicate && "motion-reduce:hidden",
    )}>
    {PARTNERS.map((partner) => (
      <li key={partner.name}>
        <a
          href={partner.href}
          target='_blank'
          rel='noopener noreferrer'
          tabIndex={duplicate ? -1 : undefined}
          className='group flex items-center gap-3 font-semibold text-[15px] text-foreground-subtle transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none'>
          <img
            src={partner.logo}
            alt=''
            width={28}
            height={28}
            loading='lazy'
            className='size-7 rounded-md object-contain opacity-70 grayscale transition-[filter,opacity] duration-300 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0'
          />
          <span className='whitespace-nowrap'>{partner.name}</span>
        </a>
      </li>
    ))}
  </ul>
);

export const PartnersStrip = () => {
  const { t } = useTranslation("home");

  return (
    <section
      aria-labelledby='partners-heading'
      className='border-border border-y bg-background-dark'>
      <div className='mx-auto flex max-w-7xl flex-col gap-5 px-6 py-8 md:flex-row md:items-center md:gap-10'>
        <h2
          id='partners-heading'
          className='shrink-0 font-medium text-foreground-subtle text-sm md:max-w-[150px] md:leading-snug'>
          {t("partners.title")}
        </h2>
        <div className='group/marquee relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] motion-reduce:[mask-image:none]'>
          <div className='flex w-max animate-marquee group-hover/marquee:[animation-play-state:paused] group-focus-within/marquee:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:flex-wrap'>
            <PartnerList />
            <PartnerList duplicate />
          </div>
        </div>
      </div>
    </section>
  );
};
