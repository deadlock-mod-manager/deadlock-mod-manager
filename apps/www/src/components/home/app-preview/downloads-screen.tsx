import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { DownloadSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { modThumbnail, PREVIEW_MODS } from "./mods";
import { EmptyState, PageTitle } from "./parts";
import { usePreviewState } from "./preview-state";
import { usePreviewNavigation } from "./store";

export const DownloadsScreen = () => {
  const { t } = useTranslation("preview");
  const { setScreen } = usePreviewNavigation();
  const { installs } = usePreviewState();
  const active = PREVIEW_MODS.flatMap((mod) => {
    const install = installs[mod.id];
    return install?.status === "downloading"
      ? [{ mod, progress: install.progress }]
      : [];
  });

  return (
    <div className='flex flex-1 flex-col px-4'>
      <PageTitle
        title={t("downloads.title")}
        subtitle={t("downloads.subtitle")}
      />
      {active.length === 0 ? (
        <EmptyState
          icon={DownloadSimpleIcon}
          title={t("downloads.empty.title")}
          description={t("downloads.empty.description")}>
          <button
            type='button'
            onClick={() => setScreen("store")}
            className={buttonVariants()}>
            <MagnifyingGlassIcon />
            {t("downloads.empty.action")}
          </button>
        </EmptyState>
      ) : (
        <ul className='flex flex-col gap-3 py-4'>
          {active.map(({ mod, progress }) => (
            <li
              key={mod.id}
              className='flex items-center gap-4 rounded-xl border bg-card p-3'>
              <img
                src={modThumbnail(mod)}
                alt=''
                width={480}
                height={360}
                className='h-14 w-20 rounded-md object-cover'
              />
              <div className='min-w-0 flex-1'>
                <div className='flex justify-between gap-4 text-sm'>
                  <span className='truncate font-medium'>{mod.name}</span>
                  <span className='text-muted-foreground tabular-nums'>
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'>
                  <div
                    className='h-full origin-left rounded-full bg-primary transition-transform duration-150'
                    style={{ transform: `scaleX(${progress / 100})` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
