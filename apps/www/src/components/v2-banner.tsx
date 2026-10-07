import { ArrowRightIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { V2_PREVIEW_URL } from "@/lib/constants";

/** Site-wide strip above the navbar announcing V2 to players who left V1. */
export const V2Banner = () => {
  const { t } = useTranslation("common");

  return (
    <a
      href={V2_PREVIEW_URL}
      target='_blank'
      rel='noopener noreferrer'
      className='group flex h-10 items-center justify-center gap-3 bg-primary px-6 font-medium text-[13px] text-primary-foreground focus-visible:outline-2 focus-visible:outline-primary-foreground focus-visible:-outline-offset-4'>
      <span className='rounded-full bg-primary-foreground px-2 py-px font-bold text-[11px] text-primary'>
        V2
      </span>
      <span className='truncate'>
        <span className='sm:hidden'>{t("v2Banner.short")}</span>
        <span className='hidden sm:inline'>{t("v2Banner.long")}</span>
      </span>
      <span className='hidden shrink-0 items-center gap-1.5 font-semibold underline-offset-3 group-hover:underline md:inline-flex'>
        {t("v2Banner.cta")}
        <ArrowRightIcon
          aria-hidden='true'
          weight='bold'
          className='size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5'
        />
      </span>
      <ArrowRightIcon
        aria-hidden='true'
        weight='bold'
        className='size-3.5 shrink-0 md:hidden'
      />
    </a>
  );
};
