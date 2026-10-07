import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckIcon, GlobeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { getLocaleConfig, LOCALES } from "@/lib/i18n/locales";
import { rememberLocale, useLocale, useLocaleLinks } from "@/lib/i18n/route";

/**
 * Language choices are plain links to the other language's URL, not client
 * navigations: the whole page (and its head tags) re-renders in that
 * language, and the choice is remembered so detection never overrides it.
 */
export const LanguageSwitcher = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const hrefFor = useLocaleLinks();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label={t("language.label")}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary",
            className,
          )}>
          <GlobeIcon aria-hidden='true' className='size-4 shrink-0' />
          <span className='uppercase'>
            {getLocaleConfig(locale).prefix ?? "en"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-44'>
        {LOCALES.map((entry) => (
          <DropdownMenuItem key={entry.id} asChild>
            <a
              href={hrefFor(entry.id)}
              hrefLang={entry.hreflang}
              lang={entry.hreflang}
              onClick={() => rememberLocale(entry.id)}
              aria-current={entry.id === locale ? "true" : undefined}
              className='flex items-center justify-between gap-3'>
              {entry.name}
              {entry.id === locale && (
                <CheckIcon aria-hidden='true' className='size-4 text-primary' />
              )}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** The same choices as a flat list, for the mobile menu. */
export const LanguageList = ({ onSelect }: { onSelect?: () => void }) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const hrefFor = useLocaleLinks();

  return (
    <div>
      <p className='font-medium text-[13px] text-muted-foreground'>
        {t("language.label")}
      </p>
      <ul className='mt-2 grid grid-cols-2 gap-1'>
        {LOCALES.map((entry) => (
          <li key={entry.id}>
            <a
              href={hrefFor(entry.id)}
              hrefLang={entry.hreflang}
              lang={entry.hreflang}
              onClick={() => {
                rememberLocale(entry.id);
                onSelect?.();
              }}
              aria-current={entry.id === locale ? "true" : undefined}
              className={cn(
                "-mx-2 block rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover",
                entry.id === locale
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground",
              )}>
              {entry.name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};
