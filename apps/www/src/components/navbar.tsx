import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@deadlock-mods/ui/components/sheet";
import {
  DownloadSimpleIcon,
  GithubLogoIcon,
  ListIcon,
} from "@phosphor-icons/react";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { APP_NAME, DOCS_URL, GITHUB_REPO } from "@/lib/constants";
import { primaryCta } from "./home/cta";
import Logo from "./logo";
import UserMenu from "./user-menu";

const sectionLinks = [
  { hash: "tour", label: "Features" },
  { hash: "themes", label: "Themes" },
  { hash: "tools", label: "Tools" },
] as const;

const linkClassName =
  "rounded-md px-3 py-2 font-medium text-[14px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary";

const mobileLinkClassName =
  "-mx-3 block rounded-lg px-3 py-2.5 font-medium text-base text-foreground hover:bg-surface-hover";

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className='relative z-40 border-border border-b bg-background'>
      <div className='mx-auto flex h-16 max-w-7xl items-center gap-6 px-6'>
        <div className='flex min-w-0 flex-1 items-center'>
          <Link
            to='/'
            aria-label='Homepage'
            className='flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-primary'>
            <Logo className='size-7 shrink-0' />
            <span className='truncate font-bold font-primary text-lg leading-none'>
              {APP_NAME}
            </span>
          </Link>
        </div>

        <nav aria-label='Primary' className='hidden items-center lg:flex'>
          {sectionLinks.map((link) => (
            <Link
              key={link.hash}
              to='/'
              hash={link.hash}
              className={linkClassName}>
              {link.label}
            </Link>
          ))}
          <a
            href={DOCS_URL}
            target='_blank'
            rel='noopener noreferrer'
            className={linkClassName}>
            Docs
          </a>
        </nav>

        <div className='flex flex-1 items-center justify-end gap-2'>
          <a
            href={GITHUB_REPO}
            target='_blank'
            rel='noopener noreferrer'
            aria-label='GitHub'
            className='relative hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:inline-flex'>
            <GithubLogoIcon aria-hidden='true' className='size-5 shrink-0' />
            <span
              aria-hidden='true'
              className='-translate-1/2 absolute top-1/2 left-1/2 size-[max(100%,3rem)] pointer-fine:hidden'
            />
          </a>
          <div className='hidden lg:block'>
            <UserMenu signInClassName={linkClassName} />
          </div>
          <Link to='/download' className={cn(primaryCta("sm"), "max-sm:px-2")}>
            <DownloadSimpleIcon aria-hidden='true' weight='bold' />
            <span className='sr-only sm:not-sr-only'>Download</span>
          </Link>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <button
                type='button'
                aria-label='Open menu'
                className='-mr-2 inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground lg:hidden'>
                <ListIcon aria-hidden='true' className='size-6 shrink-0' />
              </button>
            </SheetTrigger>
            <SheetContent
              side='right'
              className='flex w-full flex-col gap-0 border-border-strong bg-background sm:max-w-sm'>
              <SheetTitle className='flex items-center gap-2.5 font-bold font-primary text-lg'>
                <Logo className='size-7' />
                {APP_NAME}
              </SheetTitle>
              <nav
                aria-label='Mobile'
                className='mt-6 flex flex-col divide-y divide-border'>
                <div className='py-4'>
                  <Link
                    to='/download'
                    onClick={closeMenu}
                    className={mobileLinkClassName}>
                    Download
                  </Link>
                  {sectionLinks.map((link) => (
                    <Link
                      key={link.hash}
                      to='/'
                      hash={link.hash}
                      onClick={closeMenu}
                      className={mobileLinkClassName}>
                      {link.label}
                    </Link>
                  ))}
                  <a
                    href={DOCS_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={mobileLinkClassName}>
                    Docs
                  </a>
                  <a
                    href={GITHUB_REPO}
                    target='_blank'
                    rel='noopener noreferrer'
                    className={mobileLinkClassName}>
                    GitHub
                  </a>
                </div>
                <div className='py-4'>
                  <UserMenu />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
