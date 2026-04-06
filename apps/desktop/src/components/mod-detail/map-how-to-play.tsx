import { Button } from "@deadlock-mods/ui/components/button";
import { Gamepad2, Loader2, Play } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { CopyableCommand } from "@/components/shared/copyable-command";
import { useLaunchMap } from "@/hooks/use-launch-map";
import { useMapConnectCode } from "@/hooks/use-map-connect-code";
import { InviteFriendsDialog } from "./invite-friends-dialog";

interface MapHowToPlayProps {
  mapName?: string;
  isInstalled?: boolean;
}

const StepItem = ({
  stepNumber,
  children,
}: {
  stepNumber: number;
  children: React.ReactNode;
}) => (
  <li className='flex gap-3'>
    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary'>
      {stepNumber}
    </span>
    <div className='flex flex-col gap-1.5 pt-0.5'>{children}</div>
  </li>
);

const QuickLaunchBanner = ({
  mapName,
  launchMap,
  isPending,
  watching,
  onCancelWatch,
}: {
  mapName: string;
  launchMap: (name: string) => void;
  isPending: boolean;
  watching: boolean;
  onCancelWatch: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className='relative overflow-hidden rounded-lg border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,var(--color-primary)/0.08,transparent_60%)]' />

      <div className='relative flex items-center gap-4'>
        <div className='flex-1'>
          <p className='font-medium text-sm text-foreground'>
            {t("modDetail.mapHowToPlay.quickLaunchTitle")}
          </p>
          <p className='text-xs text-muted-foreground'>
            {watching
              ? t("mapInvite.watchingDesc")
              : t("modDetail.mapHowToPlay.quickLaunchDesc")}
          </p>
        </div>

        {watching ? (
          <div className='flex items-center gap-3'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Loader2 className='h-4 w-4 animate-spin' />
              <span>{t("mapInvite.watching")}</span>
            </div>
            <Button variant='ghost' size='sm' onClick={onCancelWatch}>
              {t("mapInvite.cancel")}
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => launchMap(mapName)}
            disabled={isPending}
            className='relative shadow-[0_0_12px_var(--color-primary)/0.25] transition-shadow hover:shadow-[0_0_20px_var(--color-primary)/0.35]'
            icon={
              isPending ? undefined : <Play className='h-4 w-4 fill-current' />
            }
            isLoading={isPending}>
            {isPending
              ? t("modDetail.mapHowToPlay.launchingMap")
              : t("modDetail.mapHowToPlay.launchMap")}
          </Button>
        )}
      </div>
    </div>
  );
};

export const MapHowToPlay = ({ mapName, isInstalled }: MapHowToPlayProps) => {
  const { t } = useTranslation();
  const {
    connectCode,
    dialogOpen,
    watching,
    startWatching,
    stopWatching,
    handleDialogClose,
  } = useMapConnectCode();
  const { launchMap, isPending } = useLaunchMap(startWatching);

  const displayName = mapName ?? "MAP_NAME";
  const mapCommand = `map ${displayName}`;

  const showQuickLaunch = isInstalled && mapName;

  return (
    <>
      <div className='relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card [contain:layout_style_paint]'>
        <div className='absolute top-0 left-0 h-full w-1 bg-primary' />

        <div className='p-6'>
          <div className='mb-5 flex items-center gap-3'>
            <div className='flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15'>
              <Gamepad2 className='h-5 w-5 text-primary' />
            </div>
            <div>
              <h3 className='font-semibold text-base text-foreground'>
                {t("modDetail.mapHowToPlay.title")}
              </h3>
              <p className='text-xs text-muted-foreground'>
                {t("modDetail.mapHowToPlay.step1")}
              </p>
            </div>
          </div>

          {showQuickLaunch && (
            <div className='mb-5'>
              <QuickLaunchBanner
                mapName={mapName}
                launchMap={launchMap}
                isPending={isPending}
                watching={watching}
                onCancelWatch={stopWatching}
              />
            </div>
          )}

          <ol className='space-y-4 text-sm'>
            <StepItem stepNumber={1}>
              <span className='text-foreground/90'>
                {t("modDetail.mapHowToPlay.step2")}
              </span>
            </StepItem>

            <StepItem stepNumber={2}>
              <span className='text-foreground/90'>
                {t("modDetail.mapHowToPlay.step3Command")}
              </span>
              <CopyableCommand command={mapCommand} />
              {!mapName && (
                <span className='text-xs text-muted-foreground'>
                  {t("modDetail.mapHowToPlay.mapNameFallback")}
                </span>
              )}
            </StepItem>

            <StepItem stepNumber={3}>
              <span className='text-foreground/90'>
                {t("modDetail.mapHowToPlay.step4Glitch", {
                  mapCommand,
                })}
              </span>
            </StepItem>

            <StepItem stepNumber={4}>
              <span className='text-foreground/90'>
                {t("modDetail.mapHowToPlay.step5Status")}
              </span>
            </StepItem>

            <StepItem stepNumber={5}>
              <span className='text-foreground/90'>
                {t("modDetail.mapHowToPlay.step6Share")}
              </span>
            </StepItem>
          </ol>
        </div>
      </div>

      {connectCode && (
        <InviteFriendsDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          connectCode={connectCode}
        />
      )}
    </>
  );
};
