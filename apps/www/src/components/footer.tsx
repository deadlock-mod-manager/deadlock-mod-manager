import { Link } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { APP_NAME, COPYRIGHT } from "@/lib/constants";
import Logo from "./logo";
import { StatusWidget } from "./status-widget";

export const Footer = () => {
  return (
    <footer
      className='container mx-auto w-[90%] py-24 sm:py-32 md:w-[70%] lg:w-[75%] lg:max-w-screen-xl'
      id='footer'>
      <div className='rounded-2xl border border-secondary bg-card p-10'>
        <div className='grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4 xl:grid-cols-6'>
          <div className='col-span-full flex flex-col gap-2 xl:col-span-2'>
            <a
              className='flex items-center gap-2 font-bold font-primary'
              href='#'>
              <Logo className='h-10 w-10' /> {APP_NAME}
            </a>
            <p className='text-sm opacity-60'>
              A small, open-source app for installing and managing mods for the
              Valve game Deadlock.
            </p>
            <p className='text-sm opacity-60'>
              Not affiliated with Valve. “Deadlock” and related marks are
              trademarks of Valve Corporation.
            </p>
          </div>

          <div className='flex flex-col gap-2'>
            <h3 className='font-bold font-primary text-lg'>Links</h3>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://github.com/Stormix/deadlock-modmanager/releases/latest'
                rel='noopener noreferrer'
                target='_blank'>
                Download
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://github.com/Stormix/deadlock-modmanager'
                rel='noopener noreferrer'
                target='_blank'>
                Source Code
              </a>
            </div>
          </div>

          <div className='flex flex-col gap-2'>
            <h3 className='font-bold font-primary text-lg'>Support</h3>
            <div>
              <a className='opacity-60 hover:opacity-100' href='/#faq'>
                FAQ
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md'
                rel='noopener noreferrer'
                target='_blank'>
                Report Bug
              </a>
            </div>

            <h3 className='font-bold font-primary text-lg mt-4'>Legal</h3>
            <div>
              <Link className='opacity-60 hover:opacity-100' to='/privacy'>
                Privacy Policy
              </Link>
            </div>
            <div>
              <Link className='opacity-60 hover:opacity-100' to='/terms'>
                Terms of Service
              </Link>
            </div>
          </div>

          <div className='flex flex-col gap-2'>
            <h3 className='font-bold font-primary text-lg'>Socials</h3>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://github.com/Stormix/deadlock-modmanager'
                rel='noopener noreferrer'
                target='_blank'>
                GitHub
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://github.com/Stormix/deadlock-modmanager/discussions'
                rel='noopener noreferrer'
                target='_blank'>
                Discussions
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://www.reddit.com/r/DeadlockModManager/'
                rel='noopener noreferrer'
                target='_blank'>
                Reddit
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://x.com/DLModManager'
                rel='noopener noreferrer'
                target='_blank'>
                X (Twitter)
              </a>
            </div>
          </div>

          <div className='flex flex-col gap-2'>
            <h3 className='font-bold font-primary text-lg'>Partners</h3>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='http://gamebanana.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                GameBanana
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://deadlocker.net/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                Deadlocker
              </a>
            </div>
            <div>
              <a
                className='opacity-60 hover:opacity-100'
                href='https://deadlock-api.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=partners'
                rel='noopener noreferrer'
                target='_blank'>
                Deadlock API
              </a>
            </div>
          </div>
        </div>

        <Separator className='my-6' />
        <section className='flex flex-col items-center gap-4 text-center'>
          <p className='text-sm opacity-60'>
            Powered by{" "}
            <a
              className='font-medium text-primary transition-all hover:opacity-80'
              href='https://gamebanana.com/?utm_source=deadlock-modmanager&utm_medium=footer&utm_campaign=powered-by'
              rel='noopener noreferrer'
              target='_blank'>
              GameBanana
            </a>{" "}
            for mod content and community.
          </p>
          <p>
            {COPYRIGHT}. Created by{" "}
            <a
              className='border-primary text-primary transition-all hover:border-b-2'
              href='https://github.com/Stormix'
              rel='noopener noreferrer'
              target='_blank'>
              Stormix
            </a>
          </p>
          <StatusWidget />
        </section>
      </div>
    </footer>
  );
};
