import { CheckCircle2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Preset } from "@/types/game-presets";

type ActivePresetCardProps = {
  activePreset: Preset | null;
  onDeactivate: () => void;
};

export const ActivePresetCard = ({
  activePreset,
  onDeactivate,
}: ActivePresetCardProps) => {
  const { t } = useTranslation();

  if (!activePreset) {
    return (
      <div className='rounded-lg border border-dashed bg-muted/50 p-6'>
        <div className='flex items-center justify-center gap-2 text-muted-foreground'>
          <X className='h-5 w-5' />
          <span className='font-medium'>{t("gamePresets.noActivePreset")}</span>
        </div>
        <p className='mt-2 text-center text-muted-foreground text-sm'>
          {t("gamePresets.noActivePresetDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className='rounded-lg border border-primary/50 bg-primary/10 p-6 shadow'>
      <div className='flex items-start justify-between'>
        <div className='flex-1'>
          <div className='flex items-center gap-3'>
            <CheckCircle2 className='h-6 w-6 text-green-600 dark:text-green-400' />
            <div>
              <div className='flex items-center gap-2'>
                <h3 className='font-semibold text-lg'>{activePreset.name}</h3>
                <Badge variant='default'>{t("gamePresets.active")}</Badge>
              </div>
              {activePreset.description && (
                <p className='mt-1 text-muted-foreground text-sm'>
                  {activePreset.description}
                </p>
              )}
            </div>
          </div>
          <div className='mt-3 flex items-center gap-2'>
            <span className='text-muted-foreground text-sm'>
              {t("gamePresets.optionsCount")}:
            </span>
            <Badge variant='secondary'>
              {Object.keys(activePreset.values).length}
            </Badge>
          </div>
        </div>
        <Button onClick={onDeactivate} size='sm' variant='outline'>
          <X className='mr-1 h-3 w-3' />
          {t("gamePresets.deactivate")}
        </Button>
      </div>
    </div>
  );
};

