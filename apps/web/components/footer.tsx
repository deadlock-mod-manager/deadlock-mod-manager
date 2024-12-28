import { Separator } from "@/components/ui/separator";
import { APP_NAME, COPYRIGHT } from "@/lib/constants";
import Link from "next/link";
import React from "react";
import Logo from "./logo";

export const Footer: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <footer id="footer" className="container py-24 sm:py-32 mx-auto w-[90%] md:w-[70%] lg:w-[75%] lg:max-w-screen-xl">
      <div className="p-10 bg-card border border-secondary rounded-2xl">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-x-12 gap-y-8">
          <div className="col-span-full xl:col-span-2 flex flex-col gap-2">
            <Link href="#" className="flex font-bold items-center gap-2">
              <Logo className="w-10 h-10" /> {APP_NAME}
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
                href="https://github.com/Stormix/deadlock-modmanager/releases/latest"
                className="opacity-60 hover:opacity-100"
              >
                Download
              </Link>
            </div>
            <div>
              <Link
                href="https://github.com/Stormix/deadlock-modmanager"
                className="opacity-60 hover:opacity-100"
              >
                Source Code
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg">Support</h3>
            <div>
              <Link href="/#faq" className="opacity-60 hover:opacity-100">
                FAQ
              </Link>
            </div>
            <div>
              <Link
                href="https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md"
                className="opacity-60 hover:opacity-100"
              >
                Report Bug
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg">Legal</h3>
            <div>
              <Link href="/privacy" className="opacity-60 hover:opacity-100">
                Privacy Policy
              </Link>
            </div>
            <div>
              <Link href="/terms" className="opacity-60 hover:opacity-100">
                Terms of Service
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg">Socials</h3>
            <div>
              <Link
                href="https://github.com/Stormix/deadlock-modmanager"
                target="_blank"
                className="opacity-60 hover:opacity-100"
              >
                GitHub
              </Link>
            </div>
            <div>
              <Link
                href="https://github.com/Stormix/deadlock-modmanager/discussions"
                className="opacity-60 hover:opacity-100"
              >
                Discussions
              </Link>
            </div>
          </div>
        </div>

        <Separator className="my-6" />
        <section className="text-center">
          <p>
          {COPYRIGHT} Created by{" "}
            <Link
              target="_blank"
              href="https://github.com/Stormix"
              className="text-primary transition-all border-primary hover:border-b-2"
            >
              Stormix
            </Link>
          </p>
        </section>
      </div>
    </footer>
  );
};
