import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { CloudSlashIcon, HourglassMediumIcon } from "@phosphor-icons/react";
import { type MouseEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getDownloadHealth } from "@/lib/download/health";
import type { ModProgress } from "@/lib/store/slices/mods";
import { ModStatus } from "@/types/mods";

type DownloadHealthNoticeProps = {
  progress: ModProgress | undefined;
  status: ModStatus;
};

type Notice = {
  stopped: boolean;
  title: string;
  body: string;
  /** Another GameBanana file server is a way out the user can take right now. */
  suggestFileServer: boolean;
};

/** Re-renders every second while active, since silence sends no progress events. */
const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
};

export const DownloadHealthNotice = ({
  progress,
  status,
}: DownloadHealthNoticeProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDownloading = status === ModStatus.Downloading;
  const now = useNow(isDownloading);
  const fromGameBanana = progress?.source === "gameBanana";

  const getNotice = (): Notice | null => {
    const failure = progress?.failure;
    if (status === ModStatus.FailedToDownload && failure) {
      if (failure.reason === "sourceBusy") {
        return {
          stopped: true,
          title: t("downloads.health.busyTitle"),
          body: failure.retryAfterSecs
            ? t("downloads.health.busyBodyWait", {
                count: Math.ceil(failure.retryAfterSecs / 60),
              })
            : t("downloads.health.busyBody"),
          suggestFileServer: true,
        };
      }
      return {
        stopped: true,
        title: t("downloads.health.stoppedTitle"),
        body: t("downloads.health.stoppedBody"),
        suggestFileServer: fromGameBanana,
      };
    }

    if (!isDownloading) return null;
    const health = getDownloadHealth(progress, now);
    if (health === "stalled") {
      return {
        stopped: true,
        title: fromGameBanana
          ? t("downloads.health.waitingGameBananaTitle")
          : t("downloads.health.waitingTitle"),
        body: t("downloads.health.waitingBody"),
        suggestFileServer: fromGameBanana,
      };
    }
    if (health === "slow") {
      if (fromGameBanana) {
        return {
          stopped: false,
          title: t("downloads.health.slowGameBananaTitle"),
          body: t("downloads.health.slowGameBananaBody"),
          suggestFileServer: true,
        };
      }
      return {
        stopped: false,
        title: t("downloads.health.slowTitle"),
        body: t("downloads.health.slowBody"),
        suggestFileServer: false,
      };
    }
    return null;
  };

  const notice = getNotice();
  if (!notice) return null;

  const Icon = notice.stopped ? CloudSlashIcon : HourglassMediumIcon;

  const openFileServers = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    navigate("/settings", { state: { activeTab: "network" } });
  };

  return (
    <Alert className='mt-3 items-start' role='status' variant='warning'>
      <Icon aria-hidden className='mt-0.5 size-4 shrink-0' weight='bold' />
      <AlertDescription className='min-w-0 flex-1'>
        <p className='font-medium text-foreground'>{notice.title}</p>
        <p className='mt-0.5'>{notice.body}</p>
        {notice.suggestFileServer && (
          <Button
            className='mt-1 h-auto p-0'
            onClick={openFileServers}
            size='sm'
            type='button'
            variant='link'>
            {t("downloads.health.switchFileServer")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};
