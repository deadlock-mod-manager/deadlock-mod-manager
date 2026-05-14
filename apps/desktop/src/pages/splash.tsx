import { Badge } from "@deadlock-mods/ui/components/badge";
import { Loader2 } from "@deadlock-mods/ui/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import Logo from "@/components/layout/logo";
import useAbout from "@/hooks/use-about";
import { APP_NAME, GITHUB_REPO } from "@/lib/constants";
import {
  getDisplaySemver,
  getReleaseNotesPath,
  isNightlyBuildVersion,
} from "@/lib/app-version-display";

const Splash = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useAbout();
  const { version, tauriVersion } = data || {};

  return (
    <div className='flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground'>
      <Logo className='h-32 w-32' />
      <div className='flex flex-col items-center gap-2'>
        <h1 className='font-bold font-primary text-3xl'>{APP_NAME}</h1>
        {data && version ? (
          <>
            <div className='flex flex-col items-center gap-1'>
              <span className='flex flex-wrap items-center justify-center gap-1.5 font-medium font-mono'>
                <span>
                  Version {getDisplaySemver(version)}
                  {isNightlyBuildVersion(version) ? (
                    <Badge
                      className='ml-2 h-4 px-1.5 py-0 align-middle font-medium text-[10px]'
                      variant='outline'>
                      {t("branding.nightlyBuild")}
                    </Badge>
                  ) : null}
                </span>
                <span className='font-medium font-sans text-gray-400'>
                  {"("}
                  <button
                    className='cursor-pointer text-primary hover:underline'
                    onClick={() =>
                      openUrl(`${GITHUB_REPO}${getReleaseNotesPath(version)}`)
                    }
                    type='button'>
                    {t("about.releaseNotes")}
                  </button>
                  {")"}
                </span>
              </span>
              {isNightlyBuildVersion(version) ? (
                <span className='font-mono text-muted-foreground text-xs'>
                  {t("branding.fullBuildVersion", { version })}
                </span>
              ) : null}
            </div>
            <span className='font-medium font-mono text-gray-400 text-xs'>
              {t("about.tauriVersion")} {tauriVersion}
            </span>
          </>
        ) : null}
      </div>
      {isLoading && <Loader2 className='h-8 w-8 animate-spin' />}
    </div>
  );
};

export default Splash;
