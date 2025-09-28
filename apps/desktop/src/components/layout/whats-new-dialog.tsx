import { ArrowSquareOut, Sparkle } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useAbout from "@/hooks/use-about";
import { APP_NAME, GITHUB_REPO } from "@/lib/constants";

type WhatsNewDialogProps = {
  onClose: () => void;
};

export const WhatsNewDialog = ({ onClose }: WhatsNewDialogProps) => {
  const { t } = useTranslation();
  const { data } = useAbout();

  // Use a fallback version if data is not yet available
  const version = data?.version || "0.9.0";

  const currentUpdate = t(`whatsNew.versions.${version}`, {
    returnObjects: true,
  }) as
    | {
        title: string;
        features: string[];
      }
    | undefined;

  return (
    <DialogContent className='max-w-md'>
      <DialogHeader>
        <div className='flex items-center gap-2'>
          <Sparkle className='h-5 w-5 text-primary' />
          <DialogTitle>{t("whatsNew.title")}</DialogTitle>
          <Badge variant='secondary'>v{version}</Badge>
        </div>
        <DialogDescription>
          {t("whatsNew.welcome", { appName: APP_NAME })}
        </DialogDescription>
      </DialogHeader>

      {currentUpdate && (
        <div className='space-y-4'>
          <div>
            <h3 className='mb-2 font-semibold text-foreground text-sm'>
              {currentUpdate.title}
            </h3>
            <ul className='space-y-2 text-muted-foreground text-sm'>
              {currentUpdate.features?.map((feature, index) => (
                <li
                  className='flex items-start gap-2'
                  key={`feature-${index}-${feature.slice(0, 10)}`}>
                  <span className='mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary' />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <DialogFooter className='flex flex-row items-center justify-between'>
        <Button
          className='gap-2'
          onClick={() => open(`${GITHUB_REPO}/releases/tag/v${version}`)}
          size='sm'
          variant='outline'>
          <ArrowSquareOut className='h-4 w-4' />
          {t("whatsNew.fullReleaseNotes")}
        </Button>
        <Button onClick={onClose} size='sm'>
          {t("whatsNew.gotIt")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};
