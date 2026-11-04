import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Section } from "./section";
import { usePreviewNavigation } from "./store";
import { PREVIEW_THEMES } from "./themes";

export const ThemesSection = () => {
  const { t } = useTranslation("preview");
  const { theme, setTheme } = usePreviewNavigation();
  return (
    <Section
      flat
      title={t("settings.themes.title")}
      description={t("settings.themes.description")}>
      <div className='inline-flex w-fit rounded-lg bg-muted p-1 text-sm'>
        <span className='rounded-md bg-background px-3 py-1 font-medium shadow'>
          {t("settings.themes.predefined")}
        </span>
        <span className='px-3 py-1 text-muted-foreground'>
          {t("settings.themes.custom")}
        </span>
      </div>
      <div className='grid grid-cols-2 gap-4'>
        {PREVIEW_THEMES.map((option) => {
          const isActive = option.id === theme;
          return (
            <button
              key={option.id}
              type='button'
              aria-pressed={isActive}
              onClick={() => setTheme(option.id)}
              className={cn(
                "overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-primary/60",
                isActive && "border-primary ring-1 ring-primary",
              )}>
              <img
                src={option.preview}
                alt=''
                loading='lazy'
                className='aspect-[16/9] w-full object-cover object-top-left'
              />
              <div className='space-y-1 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-semibold'>
                    {t(`themes.${option.id}.name`)}
                  </span>
                  {isActive ? (
                    <Badge>
                      <CheckCircleIcon weight='fill' className='mr-1 size-3' />
                      {t("settings.themes.active")}
                    </Badge>
                  ) : (
                    <Badge variant='outline'>
                      {t("settings.themes.inactive")}
                    </Badge>
                  )}
                </div>
                <p className='line-clamp-2 text-muted-foreground text-xs'>
                  {t(`themes.${option.id}.description`)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
};
