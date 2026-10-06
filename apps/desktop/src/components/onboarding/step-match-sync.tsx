import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMatchSync } from "@/hooks/use-match-sync";
import { useMatchSyncToggle } from "@/hooks/use-match-sync-toggle";
import { usePersistedStore } from "@/lib/store";

type MatchSyncStepProps = {
  onComplete: () => void;
};

export const OnboardingStepMatchSync = ({ onComplete }: MatchSyncStepProps) => {
  const { t } = useTranslation();
  const { status, setConsent, setEnabled } = useMatchSync();
  const setHasSeenMatchSyncNotice = usePersistedStore(
    (state) => state.setHasSeenMatchSyncNotice,
  );
  const handleEnableChange = useMatchSyncToggle({
    status,
    setConsent,
    setEnabled,
  });

  useEffect(() => {
    onComplete();
    // New users see the default here, so they don't also get the existing-user notice.
    setHasSeenMatchSyncNotice(true);
  }, [onComplete, setHasSeenMatchSyncNotice]);

  return (
    <div className='space-y-5'>
      <div>
        <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
          {t("matchSync.title")}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t("matchSync.description")}
        </p>
      </div>

      <div className='rounded-lg border border-border bg-muted/30 p-4 text-sm'>
        <p className='text-amber-500/90'>{t("matchSync.about.summary")}</p>
      </div>

      <div className='flex items-center justify-between rounded-lg border border-border p-4'>
        <div className='space-y-0.5 pr-4'>
          <Label className='text-base' htmlFor='onboarding-match-sync-switch'>
            {t("matchSync.enable.title")}
          </Label>
          <p className='text-muted-foreground text-sm'>
            {t("matchSync.enable.description")}
          </p>
        </div>
        <Switch
          checked={status?.enabled ?? false}
          disabled={!status || setConsent.isPending || setEnabled.isPending}
          id='onboarding-match-sync-switch'
          onCheckedChange={handleEnableChange}
        />
      </div>
    </div>
  );
};
