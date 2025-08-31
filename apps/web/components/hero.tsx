'use client';

import { DownloadIcon, GithubIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DOWNLOAD_URL } from '@/lib/constants';

const GITHUB_REPO = 'https://github.com/Stormix/deadlock-modmanager';

export const HeroSection: React.FC<{ version: string }> = ({ version }) => {
  return (
    <section className="container mx-auto w-full">
      <div className="mx-auto grid place-items-center gap-8 py-20 md:py-32 lg:max-w-screen-xl">
        <div className="space-y-8 text-center">
          <Badge className="py-2 text-sm" variant="outline">
            <span className="mr-2">
              <Badge variant="secondary">v{version}</Badge>
            </span>
            <span>
              <Link
                className="cursor-pointer text-secondary-foreground"
                href={`${GITHUB_REPO}/releases/tag/v${version}`}
                target="_blank"
              >
                View Release Notes
              </Link>
            </span>
          </Badge>

          <div className="mx-auto max-w-screen-md text-center font-bold text-4xl md:text-6xl">
            <h1>
              <span className="bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text px-2 text-transparent">
                Deadlock Mod Manager
              </span>
            </h1>
          </div>

          <p className="mx-auto max-w-screen-sm text-muted-foreground text-xl">
            Download, install, and manage your Deadlock mods and skins with
            ease. Browse community-created content and customize your game
            experience.
          </p>

          <div className="space-y-4 md:space-x-4 md:space-y-0">
            <Button asChild className="w-5/6 font-bold md:w-1/4" size={'lg'}>
              <Link href={DOWNLOAD_URL} target="_blank">
                <DownloadIcon className="h-4 w-4" />
                Download Now
              </Link>
            </Button>

            <Button
              asChild
              className="w-5/6 font-bold md:w-1/4"
              size={'lg'}
              variant="ghost"
            >
              <Link href={GITHUB_REPO} target="_blank">
                <GithubIcon className="h-4 w-4" />
                View on GitHub
              </Link>
            </Button>
          </div>
        </div>

        <div className="group relative mt-14">
          <div className="lg:-top-8 -translate-x-1/2 absolute top-2 left-1/2 mx-auto h-24 w-[90%] transform rounded-full bg-[#efe0be]/10 blur-3xl lg:h-80" />
          <Image
            alt="dashboard"
            className="rouded-lg relative mx-auto flex w-full items-center rounded-lg border border-secondary border-t-2 border-t-[#efe0be]/30 leading-none md:w-[1200px]"
            height={1200}
            src="/download.png"
            width={1200}
          />

          <div className="absolute bottom-0 left-0 h-20 w-full rounded-lg bg-gradient-to-b from-background/0 via-background/50 to-background md:h-28" />
        </div>
      </div>
    </section>
  );
};
