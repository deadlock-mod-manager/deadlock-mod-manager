import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { LocaleFlag } from "@/components/locale-flag";
import { LOCALES, type LocaleConfig } from "@/lib/i18n/locales";
import { rememberLocale, useLocale, useLocaleLinks } from "@/lib/i18n/route";

/** Short code shown beside the flag: "EN", "RU", "PT". */
const shortCode = (entry: LocaleConfig) =>
  entry.hreflang.slice(0, 2).toUpperCase();

/**
 * Language choices are plain links to the other language's URL, not client
 * navigations: the whole page (and its head tags) re-renders in that
 * language, and the choice is remembered so detection never overrides it.
 */
export const LanguageSwitcher = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const hrefFor = useLocaleLinks();
  const current = LOCALES.find((entry) => entry.id === locale) ?? LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label={`${t("language.label")}: ${current.name}`}
          className={cn(
            "group inline-flex h-8 items-center gap-2 rounded-md px-2 font-medium text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:bg-surface-hover data-[state=open]:text-foreground",
            className,
          )}>
          <LocaleFlag locale={current.id} />
          <span className='tabular-nums tracking-wide'>
            {shortCode(current)}
          </span>
          <CaretDownIcon
            aria-hidden='true'
            weight='bold'
            className='size-3 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[state=open]:rotate-180'
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className='w-60 border-border-strong bg-background p-1.5'>
        <DropdownMenuLabel className='px-2.5 pt-1.5 pb-2 font-medium text-[12px] text-muted-foreground'>
          {t("language.label")}
        </DropdownMenuLabel>
        {LOCALES.map((entry) => {
          const active = entry.id === locale;
          return (
            <DropdownMenuItem
              key={entry.id}
              asChild
              className={cn(
                "cursor-pointer gap-3 rounded-md px-2.5 py-2 text-[14px] focus:bg-surface-hover",
                active && "bg-surface-hover",
              )}>
              <a
                href={hrefFor(entry.id)}
                hrefLang={entry.hreflang}
                lang={entry.hreflang}
                onClick={() => rememberLocale(entry.id)}
                aria-current={active ? "true" : undefined}>
                <LocaleFlag locale={entry.id} />
                <span
                  className={cn(
                    "flex-1 truncate",
                    active
                      ? "font-semibold text-foreground"
                      : "text-foreground-soft",
                  )}>
                  {entry.name}
                </span>
                {active ? (
                  <CheckIcon
                    aria-hidden='true'
                    weight='bold'
                    className='size-4 shrink-0 text-primary'
                  />
                ) : (
                  <span className='font-medium text-[11px] text-foreground-subtle tracking-wide'>
                    {shortCode(entry)}
                  </span>
                )}
              </a>
            </DropdownMenuItem>
          );
        })}
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
      <ul className='-mx-2 mt-2 grid grid-cols-2 gap-1'>
        {LOCALES.map((entry) => {
          const active = entry.id === locale;
          return (
            <li key={entry.id}>
              <a
                href={hrefFor(entry.id)}
                hrefLang={entry.hreflang}
                lang={entry.hreflang}
                onClick={() => {
                  rememberLocale(entry.id);
                  onSelect?.();
                }}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors duration-150 hover:bg-surface-hover",
                  active
                    ? "bg-surface-hover font-semibold text-foreground"
                    : "text-muted-foreground",
                )}>
                <LocaleFlag locale={entry.id} />
                <span className='truncate'>{entry.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
