import { Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/theme";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const FlashbangToggle = () => {
  const { t } = useTranslation();
  const { flashbangEnabled, setFlashbangEnabled } = useTheme();

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{t("settings.flashbang")}</Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.flashbangDescription")}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        <Sun className='h-4 w-4 text-muted-foreground' />
        <Switch
          checked={flashbangEnabled}
          onCheckedChange={setFlashbangEnabled}
        />
      </div>
    </div>
  );
};
