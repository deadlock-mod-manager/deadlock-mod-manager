import { Button } from "@deadlock-mods/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deadlock-mods/ui/components/collapsible";
import { ChevronDown, Download } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { FaLinux, FaWindows } from "react-icons/fa";
import { useAnalyticsContext } from "@/components/analytics-provider";
import { formatFileSize } from "@/lib/os-detection";
import {
  findSignatureFor,
  getPlatformInstallers,
} from "@/lib/release-downloads";
import type { DetectedOS, PlatformDownload } from "@/types/releases";

const PLATFORMS = [
  {
    id: "windows",
    name: "Windows",
    icon: FaWindows,
  },
  {
    id: "linux",
    name: "Linux",
    icon: FaLinux,
  },
] as const;

interface InstallerRowProps {
  download: PlatformDownload;
  signature: PlatformDownload | null;
  version: string;
  recommended?: boolean;
}

const InstallerRow = ({
  download,
  signature,
  version,
  recommended = false,
}: InstallerRowProps) => {
  const { t } = useTranslation("download");
  const { analytics } = useAnalyticsContext();
  const type =
    download.installerType && download.installerType !== "sig"
      ? download.installerType
      : null;
  const label = type ? t(`installer.types.${type}.label`) : download.filename;
  const description = type ? t(`installer.types.${type}.description`) : "";

  const handleClick = () => {
    if (analytics.isEnabled) {
      analytics.trackDownloadStarted(download.platform, version, {
        architecture: download.architecture,
        file_size_mb: download.size,
      });
    }
  };

  return (
    <li className='flex items-center gap-4 py-3'>
      <div className='min-w-0 flex-1'>
        <p className='font-medium text-sm'>
          {label}
          {recommended && (
            <span className='ml-2 font-normal text-primary text-xs'>
              {t("installer.recommended")}
            </span>
          )}
        </p>
        <p className='mt-0.5 truncate text-muted-foreground text-xs'>
          {description}
          <span aria-hidden='true'> · </span>
          <span className='tabular-nums'>{formatFileSize(download.size)}</span>
          {download.architecture !== "x64" && ` · ${download.architecture}`}
          {signature && (
            <>
              <span aria-hidden='true'> · </span>
              <a
                className='underline-offset-2 hover:text-foreground hover:underline'
                download
                href={signature.url}
                title={t("installer.signatureTitle", {
                  filename: download.filename,
                })}>
                {t("installer.signature")}
              </a>
            </>
          )}
        </p>
      </div>
      <Button
        asChild
        className='w-28 shrink-0'
        size='sm'
        variant={recommended ? "default" : "outline"}>
        <a
          aria-label={t("installer.downloadLabel", {
            filename: download.filename,
          })}
          download
          href={download.url}
          onClick={handleClick}>
          <Download className='h-4 w-4' />
          {t("installer.download")}
        </a>
      </Button>
    </li>
  );
};

interface PlatformDownloadsProps {
  downloads: PlatformDownload[];
  version: string;
  userOS?: DetectedOS;
}

export const PlatformDownloads = ({
  downloads,
  version,
  userOS = "unknown",
}: PlatformDownloadsProps) => {
  const { t } = useTranslation("download");

  return (
    <div className='divide-y rounded-xl border bg-card'>
      {PLATFORMS.map(({ id, name, icon: Icon }) => {
        const { standard, experimental } = getPlatformInstallers(downloads, id);

        return (
          <div
            className='grid gap-x-8 gap-y-2 px-5 py-4 md:grid-cols-[13rem_1fr]'
            key={id}>
            <div className='flex items-start gap-3 md:py-3'>
              <Icon className='mt-0.5 h-5 w-5 shrink-0' />
              <div>
                <h3 className='font-semibold leading-tight'>{name}</h3>
                <p className='mt-1 text-muted-foreground text-xs'>
                  {t(`platforms.${id}.requirements`)}
                </p>
                {userOS === id && (
                  <p className='mt-1 text-primary text-xs'>
                    {t("platforms.detected")}
                  </p>
                )}
              </div>
            </div>

            <div className='min-w-0'>
              {standard.length === 0 ? (
                <p className='py-3 text-muted-foreground text-sm'>
                  {t("platforms.noBuilds", { platform: name })}
                </p>
              ) : (
                <ul className='divide-y divide-border/60'>
                  {standard.map((download, index) => (
                    <InstallerRow
                      download={download}
                      key={download.filename}
                      recommended={index === 0}
                      signature={findSignatureFor(downloads, download)}
                      version={version}
                    />
                  ))}
                </ul>
              )}

              {experimental.length > 0 && (
                <Collapsible className='border-border/60 border-t'>
                  <CollapsibleTrigger className='group flex w-full items-center gap-1.5 py-3 text-left text-muted-foreground text-xs transition-colors hover:text-foreground'>
                    <ChevronDown className='h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180' />
                    {t("platforms.experimental", {
                      total: experimental.length,
                    })}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className='pb-1 text-muted-foreground text-xs'>
                      {t("platforms.experimentalDescription")}
                    </p>
                    <ul className='divide-y divide-border/60'>
                      {experimental.map((download) => (
                        <InstallerRow
                          download={download}
                          key={download.filename}
                          signature={findSignatureFor(downloads, download)}
                          version={version}
                        />
                      ))}
                    </ul>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
