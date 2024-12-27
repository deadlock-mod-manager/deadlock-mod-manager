import useAbout from '@/hooks/use-about';
import useUpdateManager from '@/hooks/use-update-manager';
import { APP_DESCRIPTION, APP_NAME, COPYRIGHT, GITHUB_REPO } from '@/lib/constants';
import { CloudArrowDown, GithubLogo } from '@phosphor-icons/react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import Logo from './logo';
import { Button, buttonVariants } from './ui/button';
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Separator } from './ui/separator';

export const AboutDialog = () => {
  const { data } = useAbout();
  const { checkForUpdates, updateAndRelaunch } = useUpdateManager();
  if (!data) return null;
  const { version, name, tauriVersion } = data;

  return (
    <DialogContent className="overflow-clip pb-2">
      <DialogHeader className="flex items-center text-center">
        <div className="rounded-full bg-background p-[6px] drop-shadow-none transition duration-1000 hover:text-slate-800 hover:drop-shadow-[0_0px_10px_rgba(0,10,50,0.50)] dark:hover:text-slate-400 ">
          <Logo className="h-12 w-12" />
        </div>

        <DialogTitle className="flex flex-col items-center gap-2 pt-2">
          {APP_NAME} ({name})
          <span className="flex gap-1 font-mono text-xs font-medium">
            Version {version}
            <span className="font-sans font-medium text-gray-400">
              (
              <span
                className="cursor-pointer text-primary"
                onClick={() => open(`${GITHUB_REPO}/releases/tag/v${version}`)}
              >
                release notes
              </span>
              )
            </span>
          </span>
          <span className="font-mono text-xs font-medium text-gray-400">Tauri version: {tauriVersion}</span>
        </DialogTitle>
      </DialogHeader>

      <DialogDescription className="text-foreground text-center flex flex-col items-center gap-4">
        <div>{APP_DESCRIPTION}</div>
        <Separator className="w-8" />
        <div className="text-xs font-bold">{COPYRIGHT}</div>
      </DialogDescription>

      <DialogFooter className="flex flex-row items-center border-t pt-2 text-foreground">
        <div className="mr-auto flex flex-row gap-2">
          <GithubLogo
            className="h-5 w-5 cursor-pointer transition hover:text-foreground"
            onClick={() => open(GITHUB_REPO)}
          />
        </div>

        <Button
          type="submit"
          variant="outline"
          className="h-7 gap-1"
          onClick={async () => {
            if (await checkForUpdates()) {
              toast.info('Downloading update...');
              await updateAndRelaunch();
            } else {
              toast.info('You have the latest version.');
            }
          }}
        >
          <CloudArrowDown /> Check for Updates
        </Button>
        <DialogPrimitive.Close type="submit" className={buttonVariants({ variant: 'ghost', className: 'h-7' })}>
          Close
        </DialogPrimitive.Close>
      </DialogFooter>
    </DialogContent>
  );
};
