import { Button, buttonVariants } from "@deadlock-mods/ui/components/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CloudArrowDown,
  DiscordLogo,
  GithubLogo,
  RedditLogo,
  XLogo,
} from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import useAbout from "@/hooks/use-about";
import useUpdateManager from "@/hooks/use-update-manager";
import {
  APP_NAME,
  DISCORD_URL,
  GITHUB_REPO,
  REDDIT_URL,
  X_URL,
} from "@/lib/constants";
import Logo from "./logo";

export const AboutDialog = () => {
  const { t } = useTranslation();
  const { data } = useAbout();
  const { checkForUpdates, updateAndRelaunch } = useUpdateManager();
  if (!data) {
    return null;
  }
  const { version, tauriVersion } = data;

  return (
    <DialogContent className='overflow-clip pb-2'>
      <DialogHeader className='flex items-center text-center'>
        <div className='rounded-full bg-background p-[6px] drop-shadow-none transition duration-1000 hover:text-slate-800 hover:drop-shadow-[0_0px_10px_rgba(0,10,50,0.50)] dark:hover:text-slate-400'>
          <Logo className='h-12 w-12' />
        </div>

        <DialogTitle className='flex flex-col items-center gap-2 pt-2'>
          {APP_NAME}
          <span className='flex gap-1 font-medium font-mono text-xs'>
            Version {version}
            <span className='font-medium font-sans text-gray-400'>
              (
              <button
                className='cursor-pointer text-primary hover:underline'
                onClick={() => open(`${GITHUB_REPO}/releases/tag/v${version}`)}
                type='button'>
                {t("about.releaseNotes")}
              </button>
              )
            </span>
          </span>
          <span className='font-medium font-mono text-gray-400 text-xs'>
            {t("about.tauriVersion")} {tauriVersion}
          </span>
        </DialogTitle>
      </DialogHeader>

      <DialogDescription asChild>
        <div className='flex flex-col items-center gap-4 text-center text-foreground'>
          <div>{t("about.description")}</div>
          <div className='text-muted-foreground text-xs'>
            {t("about.thirdPartyDisclaimerShort")}
          </div>
          <Separator className='w-8' />
          <div className='text-muted-foreground text-xs'>
            Project created and maintained by{" "}
            <button
              className='cursor-pointer font-medium text-primary hover:underline'
              onClick={() => open("https://x.com/stormix_dev")}
              type='button'>
              Stormix
            </button>
          </div>
          <div className='font-bold text-xs'>{t("about.copyright")}</div>
        </div>
      </DialogDescription>

      <DialogFooter className='flex flex-row items-center border-t pt-2 text-foreground'>
        <div className='mr-auto flex flex-row gap-2'>
          <GithubLogo
            className='h-5 w-5 cursor-pointer transition hover:text-foreground'
            onClick={() => open(GITHUB_REPO)}
          />
          <DiscordLogo
            className='h-5 w-5 cursor-pointer transition hover:text-foreground'
            onClick={() => open(DISCORD_URL)}
          />
          <RedditLogo
            className='h-5 w-5 cursor-pointer transition hover:text-foreground'
            onClick={() => open(REDDIT_URL)}
          />
          <XLogo
            className='h-5 w-5 cursor-pointer transition hover:text-foreground'
            onClick={() => open(X_URL)}
          />
        </div>

        <Button
          className='h-7 gap-1'
          onClick={async () => {
            try {
              const update = await checkForUpdates();
              if (update) {
                toast.loading(t("about.downloadingUpdate"));
                await updateAndRelaunch();
              } else {
                toast.info(t("about.latestVersion"));
              }
            } catch (_e) {
              toast.error(t("about.updateFailed"));
            }
          }}
          type='submit'
          variant='outline'>
          <CloudArrowDown /> {t("about.checkForUpdates")}
        </Button>
        <DialogClose
          className={buttonVariants({ variant: "ghost", className: "h-7" })}
          type='submit'>
          {t("about.close")}
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  );
};
