import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useTranslation } from "react-i18next";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { usePersistedStore } from "@/lib/store";

const TOGGLE_ID = "toggle-setting-crash-check";

/** Ships with performance configs, behind the same experimental flag. */
export const CrashCheckToggle = () => {
  const { t } = useTranslation();
  const available = useExperimentalFeature("performance-configs");
  const crashCheckEnabled = usePersistedStore(
    (state) => state.crashCheckEnabled,
  );
  const setCrashCheckEnabled = usePersistedStore(
    (state) => state.setCrashCheckEnabled,
  );

  if (!available) return null;
  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm' htmlFor={TOGGLE_ID}>
          {t("launchHealth.settings.title")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("launchHealth.settings.description")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={crashCheckEnabled}
          id={TOGGLE_ID}
          onCheckedChange={setCrashCheckEnabled}
        />
        <Label htmlFor={TOGGLE_ID}>
          {crashCheckEnabled ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
