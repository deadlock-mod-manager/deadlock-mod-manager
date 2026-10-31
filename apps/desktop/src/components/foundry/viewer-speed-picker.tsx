import {
  ToggleGroup,
  ToggleGroupItem,
} from "@deadlock-mods/ui/components/toggle-group";
import { useTranslation } from "react-i18next";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export const SpeedPicker = ({
  speed,
  onChange,
}: {
  speed: number;
  onChange: (speed: number) => void;
}) => {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type='single'
      size='sm'
      aria-label={t("modelPreview.speed")}
      value={String(speed)}
      onValueChange={(value) => value && onChange(Number(value))}
      className='gap-0.5 rounded-md bg-muted/60 p-0.5'>
      {SPEEDS.map((value) => (
        <ToggleGroupItem
          key={value}
          value={String(value)}
          className='h-7 min-w-0 px-1.5 font-mono text-[11px] text-muted-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground'>
          {value}×
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};
