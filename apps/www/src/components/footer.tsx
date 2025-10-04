import { PhosphorIcons } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import { APP_NAME, COPYRIGHT, social } from "@/lib/constants";
import Logo from "./logo";

export const Footer = () => {
  return (
    <footer className='border border-secondary bg-card' id='footer'>
      <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20'>
        <div className='grid grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-12'>
          <div className='lg:col-span-2'>
            <a
              className='flex items-center gap-2 font-bold font-primary text-xl sm:text-2xl'
              href='#'>
              <Logo className='h-10 w-10 sm:h-12 sm:w-12' /> {APP_NAME}
            </a>
            <p className='mt-4 text-sm opacity-60 max-w-md'>
              A small, open-source app for installing and managing mods for the
              Valve game Deadlock.
            </p>
            <p className='mt-2 text-sm opacity-60 max-w-md'>
              Not affiliated with Valve. "Deadlock" and related marks are
              trademarks of Valve Corporation.
            </p>
          </div>

          <div className='grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8 lg:col-span-2'>
            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>Links</h3>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://github.com/Stormix/deadlock-modmanager/releases/latest'
                rel='noopener noreferrer'
                target='_blank'>
                Download
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://github.com/Stormix/deadlock-modmanager'
                rel='noopener noreferrer'
                target='_blank'>
                Source Code
              </a>
            </div>

            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>Support</h3>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://docs.deadlockmods.app/'
                rel='noopener noreferrer'
                target='_blank'>
                Documentation
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='/#faq'>
                FAQ
              </a>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md'
                rel='noopener noreferrer'
                target='_blank'>
                Report Bug
              </a>
            </div>

            <div className='flex flex-col gap-3'>
              <h3 className='font-bold font-primary'>Partners</h3>
              <a
                className='text-sm opacity-60 hover:opacity-100 transition-opacity'
                href='http://gamebanana.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
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
                Privacy Policy
              </Link>
              <span className='hidden sm:inline'>•</span>
              <Link
                className='hover:opacity-100 transition-opacity'
                to='/terms'>
                Terms of Service
              </Link>
            </div>

            <p className='text-sm text-center'>
              {COPYRIGHT}. Made with{" "}
              <PhosphorIcons.HeartIcon
                weight='duotone'
                className='w-4 h-4 inline-block'
              />{" "}
              by{" "}
              <a
                className='border-primary text-primary transition-all hover:border-b-2'
                href='https://github.com/Stormix'
                rel='noopener noreferrer'
                target='_blank'>
                Stormix
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
