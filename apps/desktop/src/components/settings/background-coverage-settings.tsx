import { cn } from "@deadlock-mods/ui/lib/utils";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

export const BackgroundCoverageSettings = () => {
  const { t } = useTranslation();
  const background = usePersistedStore((state) => state.appBackground);
  const updateAppBackground = usePersistedStore(
    (state) => state.updateAppBackground,
  );
  const hasImage = background.image !== "";
  const surfaceClass =
    "border-border/60 transition-colors duration-150 motion-reduce:transition-none";

  return (
    <div className='space-y-4'>
      <p className='font-medium text-sm'>{t("settings.backgroundCoverage")}</p>
      <div className='flex flex-col gap-5 sm:flex-row sm:items-center'>
        <div
          aria-hidden='true'
          className='relative grid h-28 w-40 shrink-0 grid-cols-[2.25rem_1fr] grid-rows-[1rem_1fr_0.75rem] overflow-hidden rounded-md border bg-muted/30'>
          {hasImage && (
            <img
              alt=''
              className='pointer-events-none absolute inset-0 h-full w-full object-cover'
              src={background.image}
              style={{
                opacity: background.opacity / 100,
                filter: `blur(${background.blur}px)`,
              }}
            />
          )}
          <div
            className={cn(
              "relative col-span-2 flex items-center justify-end gap-1 border-b px-2",
              surfaceClass,
              !background.includeTopBar && "bg-background",
            )}>
            <span className='h-0.5 w-1.5 rounded-full bg-foreground/40' />
            <span className='size-1 rounded-sm border border-foreground/40' />
          </div>
          <div
            className={cn(
              "relative space-y-2 border-r px-2 py-3",
              surfaceClass,
              !background.includeSidebar && "bg-background",
            )}>
            <div className='h-1 rounded-full bg-primary/60' />
            <div className='h-1 rounded-full bg-foreground/20' />
            <div className='h-1 rounded-full bg-foreground/20' />
          </div>
          <div className='relative space-y-2 p-3'>
            <div className='h-1 w-2/3 rounded-full bg-foreground/50' />
            <div className='h-7 rounded-sm border border-foreground/10 bg-background/30' />
          </div>
          <div
            className={cn(
              "relative col-span-2 border-t",
              surfaceClass,
              !background.includeBottomBar && "bg-background",
            )}
          />
        </div>
        <div className='min-w-0 flex-1 space-y-3'>
          <SettingToggleRow
            checked={background.includeSidebar}
            disabled={!hasImage}
            id='toggle-background-include-sidebar'
            onCheckedChange={(includeSidebar) =>
              updateAppBackground({ includeSidebar })
            }
            title={t("settings.backgroundIncludeSidebar")}
          />
          <SettingToggleRow
            checked={background.includeTopBar}
            disabled={!hasImage}
            id='toggle-background-include-top-bar'
            onCheckedChange={(includeTopBar) =>
              updateAppBackground({ includeTopBar })
            }
            title={t("settings.backgroundIncludeTopBar")}
          />
          <SettingToggleRow
            checked={background.includeBottomBar}
            disabled={!hasImage}
            id='toggle-background-include-bottom-bar'
            onCheckedChange={(includeBottomBar) =>
              updateAppBackground({ includeBottomBar })
            }
            title={t("settings.backgroundIncludeBottomBar")}
          />
        </div>
      </div>
    </div>
  );
};
