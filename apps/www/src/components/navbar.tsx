import { Button } from "@deadlock-mods/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@deadlock-mods/ui/components/navigation-menu";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@deadlock-mods/ui/components/sheet";
import { MenuIcon } from "@deadlock-mods/ui/icons";
import { Link } from "@tanstack/react-router";
import React from "react";
import { APP_NAME, DISCORD_URL, REDDIT_URL, X_URL } from "@/lib/constants";
import DiscordIcon from "./icons/discord-icon";
import RedditIcon from "./icons/reddit-icon";
import XIcon from "./icons/x-icon";
import Logo from "./logo";

type RouteProps = {
  href: string;
  label: string;
};

const routeList: RouteProps[] = [
  {
    href: "/#features",
    label: "Features",
  },
  {
    href: "https://docs.deadlockmods.app/",
    label: "Documentation",
  },
  {
    href: "/#faq",
    label: "FAQ",
  },
  {
    href: "/vpk-analyzer",
    label: "VPK Analyzer",
  },
  {
    href: "/kv-parser",
    label: "KV Parser",
  },
  {
    href: "/status",
    label: "Status",
  },
];

export const Navbar = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <header className='sticky top-5 z-40 mx-auto flex w-[90%] items-center justify-between rounded-2xl border border-secondary bg-card bg-opacity-15 px-8 py-3 shadow-inner md:w-[70%] lg:w-[75%] lg:max-w-screen-xl'>
      <Link className='flex items-center gap-2 font-bold text-lg' to='/'>
        <Logo className='h-10 w-10' />
        <span className='font-bold font-primary text-lg'>{APP_NAME}</span>
      </Link>

      <div className='flex items-center lg:hidden'>
        <Sheet onOpenChange={setIsOpen} open={isOpen}>
          <SheetTrigger asChild>
            <MenuIcon
              className='cursor-pointer lg:hidden'
              onClick={() => setIsOpen(!isOpen)}
            />
          </SheetTrigger>

          <SheetContent
            className='flex flex-col justify-between rounded-tr-2xl rounded-br-2xl border-secondary bg-card'
            side='left'>
            <div>
              <SheetHeader className='mb-4 ml-4'>
                <SheetTitle className='flex items-center'>
                  <Link className='flex items-center' to='/'>
                    <Logo className='h-4 w-4' />
                    Deadlock Mod Manager
                  </Link>
                </SheetTitle>
              </SheetHeader>

              <div className='flex flex-col gap-2'>
                {routeList.map(({ href, label }) => (
                  <Button
                    asChild
                    className='justify-start text-base'
                    key={href}
                    onClick={() => setIsOpen(false)}
                    variant='ghost'>
                    <a
                      href={href}
                      rel={
                        href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      target={href.startsWith("http") ? "_blank" : undefined}>
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </div>

            <SheetFooter className='flex-col items-start justify-start sm:flex-col'>
              <Separator className='mb-2' />
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <div className='hidden items-center gap-2 lg:flex'>
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              {routeList.map(({ href, label }) => (
                <NavigationMenuLink asChild key={href}>
                  <a
                    className='px-2 text-base'
                    href={href}
                    rel={
                      href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    target={href.startsWith("http") ? "_blank" : undefined}>
                    {label}
                  </a>
                </NavigationMenuLink>
              ))}
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <Button
          aria-label='Join Discord Server'
          size='icon'
          variant='ghost'
          href={DISCORD_URL}
          icon={<DiscordIcon className='h-5 w-5' />}
        />
        <Button
          aria-label='Follow on Reddit'
          icon={<RedditIcon className='h-5 w-5' />}
          size='icon'
          href={REDDIT_URL}
          variant='ghost'
        />
        <Button
          aria-label='Follow on X'
          size='icon'
          variant='ghost'
          href={X_URL}
          icon={<XIcon className='h-5 w-5' />}
        />
      </div>
    </header>
  );
};
