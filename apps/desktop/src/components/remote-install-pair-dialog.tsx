import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deadlock-mods/ui/components/alert-dialog";
import { Button } from "@deadlock-mods/ui/components/button";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  CircleNotchIcon,
  LinkSimpleIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { GameBananaLogo } from "@/components/shared/gamebanana-logo";
import { GameBananaMemberIdentity } from "@/components/shared/gamebanana-member";
import {
  useRemoteInstallPairing,
  useRemoteInstallPairRequest,
} from "@/hooks/use-remote-install";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const RemoteInstallPairDialog = () => {
  const { t } = useTranslation();
  const { memberId, dismiss } = useRemoteInstallPairRequest();
  const { pair } = useRemoteInstallPairing();

  const handleLink = async () => {
    try {
      await pair.mutateAsync();
      usePersistedStore.getState().markFeatureUsed("remote-install");
      toast.success(t("remoteInstall.paired"));
      dismiss();
    } catch (error) {
      logger.withError(error).error("Failed to pair Remote Install");
      toast.error(t("remoteInstall.pairFailed"));
    }
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !pair.isPending) dismiss();
      }}
      open={memberId !== null}>
      <AlertDialogContent className='gap-0 overflow-hidden p-0 sm:max-w-md'>
        <div className='space-y-5 p-6'>
          <div className='flex items-start gap-4'>
            <div className='flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10'>
              <GameBananaLogo className='size-8' />
            </div>
            <AlertDialogHeader className='min-w-0 flex-1 space-y-1.5 pt-0.5 text-left'>
              <AlertDialogTitle className='text-base leading-6'>
                {t("remoteInstall.pairTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className='leading-relaxed'>
                {t("remoteInstall.pairBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          {memberId !== null && (
            <div className='rounded-md border bg-muted/30 p-3'>
              <GameBananaMemberIdentity memberId={memberId} />
            </div>
          )}

          <p className='flex items-start gap-2 text-muted-foreground text-xs leading-relaxed'>
            <ShieldCheckIcon
              aria-hidden
              className='mt-px size-4 shrink-0'
              weight='duotone'
            />
            {t("remoteInstall.pairWarning")}
          </p>
        </div>
        <AlertDialogFooter className='gap-2 border-t bg-muted/30 px-6 py-3 sm:space-x-0'>
          <Button
            disabled={pair.isPending}
            onClick={dismiss}
            type='button'
            variant='ghost'>
            {t("remoteInstall.pairCancel")}
          </Button>
          <Button disabled={pair.isPending} onClick={handleLink} type='button'>
            {pair.isPending ? (
              <CircleNotchIcon aria-hidden className='animate-spin' />
            ) : (
              <LinkSimpleIcon aria-hidden weight='bold' />
            )}
            {t("remoteInstall.pairAction")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
