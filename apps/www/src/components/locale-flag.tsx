import { cn } from "@deadlock-mods/ui/lib/utils";
import { useId } from "react";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Small flag artwork per language. Inline SVG rather than emoji: Windows,
 * where most visitors are, renders flag emoji as two letters.
 */
const FLAGS = {
  en: (
    <>
      <rect width='30' height='20' fill='#012169' />
      <path d='M0 0l30 20M30 0L0 20' stroke='#f6f6f1' strokeWidth='4' />
      <path d='M0 0l30 20M30 0L0 20' stroke='#c8102e' strokeWidth='1.6' />
      <path d='M15 0v20M0 10h30' stroke='#f6f6f1' strokeWidth='6' />
      <path d='M15 0v20M0 10h30' stroke='#c8102e' strokeWidth='3.4' />
    </>
  ),
  ru: (
    <>
      <rect width='30' height='20' fill='#f6f6f1' />
      <rect y='6.67' width='30' height='6.67' fill='#0039a6' />
      <rect y='13.33' width='30' height='6.67' fill='#d52b1e' />
    </>
  ),
  "pt-BR": (
    <>
      <rect width='30' height='20' fill='#009b3a' />
      <path d='M15 2.6 27.2 10 15 17.4 2.8 10Z' fill='#fedf00' />
      <circle cx='15' cy='10' r='4.3' fill='#002776' />
      <path
        d='M10.9 9.1a9 9 0 0 1 8.2 2.2'
        stroke='#f6f6f1'
        strokeWidth='0.8'
        fill='none'
      />
    </>
  ),
  pl: (
    <>
      <rect width='30' height='20' fill='#f6f6f1' />
      <rect y='10' width='30' height='10' fill='#dc143c' />
    </>
  ),
  de: (
    <>
      <rect width='30' height='20' fill='#1b1a18' />
      <rect y='6.67' width='30' height='6.67' fill='#dd0000' />
      <rect y='13.33' width='30' height='6.67' fill='#ffce00' />
    </>
  ),
  fr: (
    <>
      <rect width='30' height='20' fill='#f6f6f1' />
      <rect width='10' height='20' fill='#002654' />
      <rect x='20' width='10' height='20' fill='#ce1126' />
    </>
  ),
  es: (
    <>
      <rect width='30' height='20' fill='#aa151b' />
      <rect y='5' width='30' height='10' fill='#f1bf00' />
    </>
  ),
} satisfies Record<Locale, React.ReactNode>;

export const LocaleFlag = ({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) => {
  // The same flag can render twice on a page (trigger and menu).
  const clipId = useId();
  return (
    <svg
      viewBox='0 0 30 20'
      aria-hidden='true'
      className={cn("h-3.5 w-5 shrink-0", className)}>
      <clipPath id={clipId}>
        <rect width='30' height='20' rx='2.5' />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{FLAGS[locale]}</g>
      {/* Hairline edge so dark stripes don't dissolve into dark surfaces. */}
      <rect
        x='0.5'
        y='0.5'
        width='29'
        height='19'
        rx='2.5'
        fill='none'
        stroke='rgb(255 255 255 / 0.18)'
      />
    </svg>
  );
};
