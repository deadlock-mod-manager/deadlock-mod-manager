'use client';

import Link from 'next/link';
import { GoogleAnalytics } from 'nextjs-google-analytics';
import type React from 'react';
import { Separator } from '@/components/ui/separator';
import { APP_NAME, COPYRIGHT } from '@/lib/constants';
import Logo from './logo';
import { StatusWidget } from './status-widget';

export const Footer: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  return (
    <>
      <GoogleAnalytics trackPageViews />
      <footer
        className="container mx-auto w-[90%] py-24 sm:py-32 md:w-[70%] lg:w-[75%] lg:max-w-screen-xl"
        id="footer"
      >
        <div className="rounded-2xl border border-secondary bg-card p-10">
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 md:grid-cols-4 xl:grid-cols-6">
            <div className="col-span-full flex flex-col gap-2 xl:col-span-2">
              <Link className="flex items-center gap-2 font-bold" href="#">
                <Logo className="h-10 w-10" /> {APP_NAME}
              </Link>
              <p className="text-sm opacity-60">
                Deadlock Mod Manager is a tool for installing and managing mods
                for the Valve game "Deadlock".
              </p>
              <p className="text-sm opacity-60">
                Not affiliated with Valve. Deadlock, and the Deadlock logo are
                registered trademarks of Valve Corporation.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-lg">Links</h3>
              <div>
                <Link
                  className="opacity-60 hover:opacity-100"
                  href="https://github.com/Stormix/deadlock-modmanager/releases/latest"
                >
                  Download
                </Link>
              </div>
              <div>
                <Link
                  className="opacity-60 hover:opacity-100"
                  href="https://github.com/Stormix/deadlock-modmanager"
                >
                  Source Code
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-lg">Support</h3>
              <div>
                <Link className="opacity-60 hover:opacity-100" href="/#faq">
                  FAQ
                </Link>
              </div>
              <div>
                <Link
                  className="opacity-60 hover:opacity-100"
                  href="https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md"
                >
                  Report Bug
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-lg">Legal</h3>
              <div>
                <Link className="opacity-60 hover:opacity-100" href="/privacy">
                  Privacy Policy
                </Link>
              </div>
              <div>
                <Link className="opacity-60 hover:opacity-100" href="/terms">
                  Terms of Service
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-lg">Socials</h3>
              <div>
                <Link
                  className="opacity-60 hover:opacity-100"
                  href="https://github.com/Stormix/deadlock-modmanager"
                  target="_blank"
                >
                  GitHub
                </Link>
              </div>
              <div>
                <Link
                  className="opacity-60 hover:opacity-100"
                  href="https://github.com/Stormix/deadlock-modmanager/discussions"
                >
                  Discussions
                </Link>
              </div>
            </div>
          </div>

          <Separator className="my-6" />
          <section className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm opacity-60">
              Powered by{' '}
              <Link
                className="font-medium text-primary transition-all hover:opacity-80"
                href="https://gamebanana.com/"
                target="_blank"
              >
                GameBanana
              </Link>{' '}
              for mod content and community
            </p>
            <p>
              {COPYRIGHT}. Created by{' '}
              <Link
                className="border-primary text-primary transition-all hover:border-b-2"
                href="https://github.com/Stormix"
                target="_blank"
              >
                Stormix
              </Link>
            </p>
            <StatusWidget />
          </section>
        </div>
      </footer>
    </>
  );
};
