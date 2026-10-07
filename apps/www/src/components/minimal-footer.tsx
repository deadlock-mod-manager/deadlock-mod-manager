import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { COPYRIGHT } from "@/lib/constants";

export const MinimalFooter = () => {
  const { t } = useTranslation("common");

  return (
    <footer className='border-t border-border bg-background'>
      <div className='mx-auto max-w-7xl px-4 py-6'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <div className='flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground'>
            <Link
              className='hover:text-foreground transition-colors'
              to='/privacy'>
              {t("footer.legal.privacy")}
            </Link>
            <span className='hidden sm:inline'>•</span>
            <Link
              className='hover:text-foreground transition-colors'
              to='/terms'>
              {t("footer.legal.terms")}
            </Link>
          </div>

          <p className='text-sm text-muted-foreground'>
            <Trans
              t={t}
              i18nKey='footer.madeBy'
              values={{ copyright: COPYRIGHT }}
              components={{
                heart: (
                  <PhosphorIcons.HeartIcon
                    weight='duotone'
                    className='w-4 h-4 inline-block'
                  />
                ),
                link: (
                  <a
                    className='text-primary hover:underline transition-all'
                    href='https://github.com/Stormix'
                    rel='noopener noreferrer'
                    target='_blank'
                  />
                ),
              }}
            />
          </p>
        </div>
      </div>
    </footer>
  );
};
