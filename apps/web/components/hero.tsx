"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOWNLOAD_URL } from "@/lib/constants";
import { DownloadIcon, GithubIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const GITHUB_REPO = "https://github.com/Stormix/deadlock-modmanager";

export const HeroSection: React.FC<{ version: string }> = ({ version }) => {
  return (
    <section className="container w-full mx-auto">
      <div className="grid place-items-center lg:max-w-screen-xl gap-8 mx-auto py-20 md:py-32">
        <div className="text-center space-y-8">
          <Badge variant="outline" className="text-sm py-2">
            <span className="mr-2">
              <Badge variant="secondary">v{version}</Badge>
            </span>
            <span>
              <Link
                href={`${GITHUB_REPO}/releases/tag/v${version}`}
                target="_blank"
                className="cursor-pointer text-secondary-foreground"
              >
                View Release Notes
              </Link>
            </span>
          </Badge>

          <div className="max-w-screen-md mx-auto text-center text-4xl md:text-6xl font-bold">
            <h1>
              <span className="text-transparent px-2 bg-gradient-to-r from-[#EFE1BE] to-primary bg-clip-text">
                Deadlock Mod Manager
              </span>
            </h1>
          </div>

          <p className="max-w-screen-sm mx-auto text-xl text-muted-foreground">
            Download, install, and manage your Deadlock mods and skins with ease. Browse community-created content and customize your game experience.
          </p>

          <div className="space-y-4 md:space-y-0 md:space-x-4">
            <Button asChild className="w-5/6 md:w-1/4 font-bold" size={"lg"}>
              <Link
                href={DOWNLOAD_URL}
                target="_blank"
              >
                <DownloadIcon className="w-4 h-4" />
                Download Now
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="w-5/6 md:w-1/4 font-bold" size={"lg"}
            >
              <Link
                href={GITHUB_REPO}
                target="_blank"
              >
                <GithubIcon className="w-4 h-4" />
                View on GitHub
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative group mt-14">
          <div className="absolute top-2 lg:-top-8 left-1/2 transform -translate-x-1/2 w-[90%] mx-auto h-24 lg:h-80 bg-[#efe0be]/10 rounded-full blur-3xl"></div>
          <Image
            width={1200}
            height={1200}
            className="w-full md:w-[1200px] mx-auto rounded-lg relative rouded-lg leading-none flex items-center border border-t-2 border-secondary border-t-[#efe0be]/30"
            src="/download.png"
            alt="dashboard"
          />

          <div className="absolute bottom-0 left-0 w-full h-20 md:h-28 bg-gradient-to-b from-background/0 via-background/50 to-background rounded-lg"></div>
        </div>
      </div>
    </section>
  );
};
