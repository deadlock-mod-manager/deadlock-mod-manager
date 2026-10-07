import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import {
  APP_NAME,
  BUG_REPORT_URL,
  COPYRIGHT,
  GITHUB_REPO,
  social,
} from "@/lib/constants";
import { GUIDES } from "@/lib/guides";
import Logo from "./logo";

export const Footer = () => {
  const { t } = useTranslation("common");

  return (
    <footer className='border border-secondary bg-card' id='footer'>
      <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20'>
        <div className='grid grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-12'>
          <div className='lg:col-span-2'>
            <a
              className='flex items-center gap-2 font-bold font-primary text-xl sm:text-2xl'
              href='/'>
              <Logo className='h-10 w-10 sm:h-12 sm:w-12' /> {APP_NAME}
            </a>
            <p className='mt-4 text-sm opacity-60 max-w-md'>
              {t("footer.tagline")}
            </p>
            <p className='mt-2 text-sm opacity-60 max-w-md'>
              {t("footer.disclaimer")}
            </p>
          </div>

          <div className='grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8 lg:col-span-2'>
            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>
                {t("footer.headings.links")}
              </h3>
              <Link
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                to='/download'>
                {t("footer.links.download")}
              </Link>
              <Link
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                to='/changelog'>
                {t("footer.links.changelog")}
              </Link>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href={GITHUB_REPO}
                rel='noopener noreferrer'
                target='_blank'>
                {t("footer.links.sourceCode")}
              </a>
            </div>

            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>
                {t("footer.headings.guides")}
              </h3>
              {GUIDES.map((guide) => (
                <Link
                  key={guide.path}
                  className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                  to={guide.path}>
                  {t(`guides.${guide.key}.label`)}
                </Link>
              ))}
            </div>

            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>
                {t("footer.headings.support")}
              </h3>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://docs.deadlockmods.app/'
                rel='noopener noreferrer'
                target='_blank'>
                {t("footer.links.documentation")}
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='/#faq'>
                {t("footer.links.faq")}
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href={BUG_REPORT_URL}
                rel='noopener noreferrer'
                target='_blank'>
                {t("footer.links.reportBug")}
              </a>
            </div>

            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>
                {t("footer.headings.partners")}
              </h3>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://gamebanana.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                GameBanana
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://deadlocker.net/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                Deadlocker
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://deadlock-api.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                Deadlock API
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://deadlockskins.gg/?ref=dmm&utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                DeadlockSkins.gg
              </a>
            </div>
          </div>
        </div>

        <div className='mt-12 pt-8 border-t border-secondary/50'>
          <div className='flex flex-col items-center gap-6'>
            <div className='flex gap-6'>
              {social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target='_blank'
                  className='opacity-60 hover:opacity-100 transition-opacity'
                  rel='noopener noreferrer'>
                  <span className='sr-only'>{item.name}</span>
                  <item.icon aria-hidden='true' className='size-6' />
                </a>
              ))}
            </div>

            <div className='flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm opacity-60'>
              <Link
                className='hover:opacity-100 transition-opacity'
                to='/privacy'>
                {t("footer.legal.privacy")}
              </Link>
              <span className='hidden sm:inline'>•</span>
              <Link
                className='hover:opacity-100 transition-opacity'
                to='/terms'>
                {t("footer.legal.terms")}
              </Link>
              <span className='hidden sm:inline'>•</span>
              <Link
                className='hover:opacity-100 transition-opacity'
                to='/transparency'>
                {t("footer.legal.transparency")}
              </Link>
            </div>

            <p className='text-sm text-center'>
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
                      className='border-primary text-primary transition-all hover:border-b-2'
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
      </div>
    </footer>
  );
};
