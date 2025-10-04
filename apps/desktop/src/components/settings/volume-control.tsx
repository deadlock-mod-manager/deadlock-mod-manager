import { Label } from "@deadlock-mods/ui/components/label";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Volume1, Volume2, VolumeX } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

const VolumeControl = () => {
  const { t } = useTranslation();
  const audioVolume = usePersistedStore((state) => state.audioVolume);
  const setAudioVolume = usePersistedStore((state) => state.setAudioVolume);

  const handleVolumeChange = (value: number[]) => {
    setAudioVolume(value[0]);
  };

  const getVolumeIcon = () => {
    if (audioVolume === 0) {
      return <VolumeX className='h-4 w-4' />;
    }
    if (audioVolume < 50) {
      return <Volume1 className='h-4 w-4' />;
    }
    return <Volume2 className='h-4 w-4' />;
  };

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>{t("settings.audioVolume")}</Label>
        <p className='text-muted-foreground text-sm'>
          {t("settings.audioVolumeDescription")}
        </p>
      </div>
      <div className='flex min-w-48 items-center space-x-4'>
        {getVolumeIcon()}
        <div className='flex-1'>
          <Slider
            className='w-full'
            max={100}
            min={0}
            onValueChange={handleVolumeChange}
            step={1}
            value={[audioVolume]}
          />
        </div>
        <span className='min-w-[2.5rem] text-right font-medium text-sm'>
          {audioVolume}%
        </span>
      </div>
    </div>
  );
};

export default VolumeControl;
