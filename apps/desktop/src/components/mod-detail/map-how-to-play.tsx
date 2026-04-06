import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Check, Copy, Gamepad2, Play, Terminal } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLaunchMap } from "@/hooks/use-launch-map";

interface MapHowToPlayProps {
  mapName?: string;
  isInstalled?: boolean;
}

const CopyableCommand = ({ command }: { command: string }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success(t("modDetail.mapHowToPlay.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className='group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 font-mono text-sm transition-all hover:border-primary/40 hover:bg-primary/10'
      onClick={handleCopy}
      type='button'>
      <Terminal className='h-4 w-4 shrink-0 text-primary/60' />
      <span className='flex-1 text-left text-primary'>{command}</span>
      <span className='flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground'>
        {copied ? (
          <>
            <Check className='h-3.5 w-3.5 text-green-500' />
            <span className='text-green-500'>
              {t("modDetail.mapHowToPlay.copied")}
            </span>
          </>
        ) : (
          <Copy className='h-3.5 w-3.5' />
        )}
      </span>
    </button>
  );
};

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
}: {
  mapName: string;
  launchMap: (name: string) => void;
  isPending: boolean;
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
            {t("modDetail.mapHowToPlay.quickLaunchDesc")}
          </p>
        </div>

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
      </div>
    </div>
  );
};

export const MapHowToPlay = ({ mapName, isInstalled }: MapHowToPlayProps) => {
  const { t } = useTranslation();
  const { launchMap, isPending } = useLaunchMap();

  const displayName = mapName ?? "MAP_NAME";
  const mapCommand = `map ${displayName}`;

  const showQuickLaunch = isInstalled && mapName;

  return (
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
  );
};
