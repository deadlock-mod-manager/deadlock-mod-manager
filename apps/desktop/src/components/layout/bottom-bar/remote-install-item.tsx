import { useTranslation } from "react-i18next";
import { downloadManager } from "@/lib/download/manager";
import { usePersistedStore } from "@/lib/store";
import { ModStatus } from "@/types/mods";

export function RemoteInstallItem({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const mod = usePersistedStore((state) =>
    state.localMods.find((localMod) => localMod.remoteId === slug),
  );
  const percentage = usePersistedStore(
    (state) => state.modProgress[slug]?.percentage,
  );
  const waiting = usePersistedStore((state) => {
    const localMod = state.localMods.find((m) => m.remoteId === slug);
    return localMod !== undefined && downloadManager.isWaiting(localMod);
  });

  let label = t("remoteInstall.itemPreparing");
  if (waiting) {
    label = t("modStatus.waiting");
  } else if (
    mod?.status === ModStatus.Downloading ||
    mod?.status === ModStatus.Extracting
  ) {
    label =
      percentage != null
        ? t("remoteInstall.itemDownloading", {
            percentage: Math.round(percentage),
          })
        : t("remoteInstall.itemDownloadingStarted");
  } else if (mod?.status === ModStatus.Installing) {
    label = t("remoteInstall.itemInstalling");
  }

  return (
    <li className='flex items-center justify-between gap-3 text-xs'>
      <span className='truncate'>{mod?.name ?? slug}</span>
      <span className='shrink-0 text-muted-foreground tabular-nums'>
        {label}
      </span>
    </li>
  );
}
