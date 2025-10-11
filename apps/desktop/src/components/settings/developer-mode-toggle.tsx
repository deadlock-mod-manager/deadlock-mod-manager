import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { Code } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

export const DeveloperModeToggle = () => {
  const { t } = useTranslation();
  const developerMode = usePersistedStore((state) => state.developerMode);
  const setDeveloperMode = usePersistedStore((state) => state.setDeveloperMode);

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.developerMode")}
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.developerModeDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Code className='h-4 w-4 text-muted-foreground' />
        <Switch checked={developerMode} onCheckedChange={setDeveloperMode} />
      </div>
    </div>
  );
};
