import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@deadlock-mods/ui/components/sheet";
import { Github, List, PhosphorIcons, X } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { LuExternalLink } from "react-icons/lu";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { APP_NAME, GITHUB_REPO } from "@/lib/constants";
import Logo from "./logo";
import UserMenu from "./user-menu";

type RouteProps = {
  href: string;
  labelKey: string;
  external?: boolean;
};

const routeList: RouteProps[] = [
  {
    href: "/",
    labelKey: "nav.home",
  },
  {
    href: "/mods",
    labelKey: "nav.browseMods",
  },
  {
    href: "/crosshair-generator",
    labelKey: "nav.crosshairGenerator",
  },
  {
    href: "/status",
    labelKey: "nav.status",
    external: true,
  },
  {
    href: "https://docs.deadlockmods.app/",
    labelKey: "nav.documentation",
    external: true,
  },
];

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { t } = useTranslation();

  return (
    <header className='bg-background'>
      <nav
        aria-label='Global'
        className='container mx-auto flex items-center justify-between gap-x-6 px-4 py-6'>
        <div className='flex lg:flex-1'>
          <Link className='flex items-center gap-2 -m-1.5 p-1.5' to='/'>
            <span className='sr-only'>{APP_NAME}</span>
            <Logo className='h-8 w-auto' />
            <span className='font-bold font-primary text-lg'>{APP_NAME}</span>
          </Link>
        </div>
        <div className='hidden lg:flex lg:gap-x-6'>
          {routeList.map((item) => (
            <a
              key={item.labelKey}
              href={item.href}
              rel={item.external ? "noopener noreferrer" : undefined}
              target={item.external ? "_blank" : undefined}
              className='flex items-center gap-1 text-sm/6 font-semibold text-foreground'>
              {t(item.labelKey)}
              {item.external && (
                <LuExternalLink className='size-3.5' aria-hidden='true' />
              )}
            </a>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger className='flex items-center gap-1 text-sm/6 font-semibold text-foreground hover:text-foreground/80 transition-colors outline-none data-[state=open]:text-foreground/80'>
              {t("nav.tools")}
              <PhosphorIcons.CaretDownIcon className='size-4' />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              sideOffset={12}
              className='min-w-[220px] bg-background/95 backdrop-blur-sm border-border/50 shadow-xl p-2'>
              <DropdownMenuItem
                asChild
                className='cursor-pointer px-3 py-2.5 rounded-md hover:bg-muted/80 focus:bg-muted/80'>
                <Link to='/vpk-analyzer' className='w-full font-medium'>
                  {t("nav.vpkAnalyzer")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className='cursor-pointer px-3 py-2.5 rounded-md hover:bg-muted/80 focus:bg-muted/80'>
                <Link to='/kv-parser' className='w-full font-medium'>
                  {t("nav.kvParser")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className='hidden flex-1 items-center justify-end gap-x-4 sm:flex'>
          <ModeToggle />
          <LanguageToggle />
          <Button
            size='sm'
            href={GITHUB_REPO}
            icon={<Github className='size-4' />}>
            <span className='hidden md:inline'>{t("common.viewSource")}</span>
            <span className='md:hidden'>{t("common.source")}</span>
          </Button>
          <UserMenu />
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
                <div className='ml-auto flex items-center gap-2'>
                  <ModeToggle />
                  <LanguageToggle />
                  <UserMenu />
                  <button
                    type='button'
                    onClick={() => setMobileMenuOpen(false)}
                    className='-m-2.5 rounded-md p-2.5 text-muted-foreground'>
                    <span className='sr-only'>Close menu</span>
                    <X aria-hidden='true' className='size-6' />
                  </button>
                </div>
              </div>
              <div className='mt-6 flow-root'>
                <div className='-my-6 divide-y divide-border'>
                  <div className='space-y-2 py-6'>
                    {routeList.map((item) => (
                      <a
                        key={item.labelKey}
                        href={item.href}
                        rel={item.external ? "noopener noreferrer" : undefined}
                        target={item.external ? "_blank" : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                        className='-mx-3 flex items-center gap-2 rounded-lg px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-muted'>
                        {t(item.labelKey)}
                        {item.external && (
                          <LuExternalLink
                            className='size-4'
                            aria-hidden='true'
                          />
                        )}
                      </a>
                    ))}
                    <div className='-mx-3 px-3 py-2'>
                      <div className='font-semibold text-base/7 text-muted-foreground'>
                        {t("nav.tools")}
                      </div>
                      <div className='mt-2 space-y-2'>
                        <Link
                          to='/vpk-analyzer'
                          onClick={() => setMobileMenuOpen(false)}
                          className='flex items-center gap-2 rounded-lg px-3 py-2 text-base/7 font-medium text-foreground hover:bg-muted'>
                          {t("nav.vpkAnalyzer")}
                        </Link>
                        <Link
                          to='/kv-parser'
                          onClick={() => setMobileMenuOpen(false)}
                          className='flex items-center gap-2 rounded-lg px-3 py-2 text-base/7 font-medium text-foreground hover:bg-muted'>
                          {t("nav.kvParser")}
                        </Link>
                      </div>
                    </div>
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
