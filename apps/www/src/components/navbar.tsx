import { Button } from "@deadlock-mods/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@deadlock-mods/ui/components/sheet";
import { List, PhosphorIcons, X } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import React from "react";
import { LuExternalLink } from "react-icons/lu";
import { APP_NAME, GITHUB_REPO } from "@/lib/constants";
import Logo from "./logo";

type RouteProps = {
  href: string;
  label: string;
  external?: boolean;
};

const routeList: RouteProps[] = [
  {
    href: "/#features",
    label: "Features",
  },
  {
    href: "/#stats",
    label: "Stats",
  },
  {
    href: "/#showcase",
    label: "Showcase",
  },
  {
    href: "/#faq",
    label: "FAQ",
  },
  {
    href: "/status",
    label: "Status",
  },
  {
    href: "https://docs.deadlockmods.app/",
    label: "Documentation",
    external: true,
  },
];

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  return (
    <header className='bg-background'>
      <nav
        aria-label='Global'
        className='mx-auto flex max-w-7xl items-center justify-between gap-x-6 p-6 lg:px-8'>
        <div className='flex lg:flex-1'>
          <Link className='flex items-center gap-2 -m-1.5 p-1.5' to='/'>
            <span className='sr-only'>{APP_NAME}</span>
            <Logo className='h-8 w-auto' />
            <span className='font-bold font-primary text-lg'>{APP_NAME}</span>
          </Link>
        </div>
        <div className='hidden lg:flex lg:gap-x-12'>
          {routeList.map((item) => (
            <a
              key={item.label}
              href={item.href}
              rel={item.external ? "noopener noreferrer" : undefined}
              target={item.external ? "_blank" : undefined}
              className='flex items-center gap-1 text-sm/6 font-semibold text-foreground'>
              {item.label}
              {item.external && (
                <LuExternalLink className='size-3.5' aria-hidden='true' />
              )}
            </a>
          ))}
        </div>
        <div className='hidden flex-1 items-center justify-end gap-x-6 sm:flex'>
          <Button
            size='sm'
            href={GITHUB_REPO}
            icon={<PhosphorIcons.GithubLogoIcon />}>
            <span className='hidden md:inline'>View Source</span>
            <span className='md:hidden'>Source</span>
          </Button>
        </div>
        <div className='flex lg:hidden'>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type='button'
                className='-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground'>
                <span className='sr-only'>Open main menu</span>
                <List aria-hidden='true' className='size-6' />
              </button>
            </SheetTrigger>
            <SheetContent side='right' className='w-full sm:max-w-sm'>
              <div className='flex items-center gap-x-6'>
                <Link className='flex items-center gap-2 -m-1.5 p-1.5' to='/'>
                  <span className='sr-only'>{APP_NAME}</span>
                  <Logo className='h-8 w-auto' />
                </Link>
                <Button size='sm' className='ml-auto' href='/download'>
                  Download
                </Button>
                <button
                  type='button'
                  onClick={() => setMobileMenuOpen(false)}
                  className='-m-2.5 rounded-md p-2.5 text-muted-foreground'>
                  <span className='sr-only'>Close menu</span>
                  <X aria-hidden='true' className='size-6' />
                </button>
              </div>
              <div className='mt-6 flow-root'>
                <div className='-my-6 divide-y divide-border'>
                  <div className='space-y-2 py-6'>
                    {routeList.map((item) => (
                      <a
                        key={item.label}
                        href={item.href}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        target={item.external ? "_blank" : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                        className='-mx-3 flex items-center gap-2 rounded-lg px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-muted'>
                        {item.label}
                        {item.external && (
                          <LuExternalLink
                            className='size-4'
                            aria-hidden='true'
                          />
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
};
