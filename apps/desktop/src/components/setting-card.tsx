import { LocalSetting } from '@/types/settings';
import { CustomSettingType } from '@deadlock-mods/utils';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface SettingsCardProps {
  setting: LocalSetting | undefined;
  onChange: (newValue: boolean) => void;
}

const Command = ({ setting }: Pick<SettingsCardProps, 'setting'>) => {
  if (!setting) return null;

  if (setting.type != CustomSettingType.LAUNCH_OPTION) {
    return (
      <code>
        {setting.key} {setting.value}
      </code>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger className="flex flex-row items-center gap-2">
        Command:
        <code
          className="underline-offset-4 underline decoration-dotted cursor-copy"
          onClick={() => {
            navigator.clipboard.writeText(`+${setting.key} ${setting.value}`);
            toast.success('Copied to clipboard');
          }}
        >
          +{setting.key} {setting.value}
        </code>
      </TooltipTrigger>
      <TooltipContent>
        <p>Copy to clipboard</p>
      </TooltipContent>
    </Tooltip>
  );
};

export const SettingCardSkeleton = () => {
  return (
    <div className="flex flex-row justify-between items-center pl-8">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">
          <Skeleton className="w-48 h-6" />
        </h3>
        <div className="text-sm text-muted-foreground">
          <Skeleton className="w-96 h-4" />
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="toggle-setting" disabled />
        <Label htmlFor="toggle-setting">
          <Skeleton className="w-16 h-4" />
        </Label>
      </div>
    </div>
  );
};

const SettingCard = ({ setting, onChange }: SettingsCardProps) => {
  if (!setting) return <SettingCardSkeleton />;
  const custom = setting.id.startsWith('local_setting_');
  return (
    <div className="flex flex-row justify-between items-center pl-8">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium">
          {setting.description} {custom && <Badge>Custom</Badge>}
        </h3>
        <p className="text-sm text-muted-foreground">
          <Command setting={setting} />
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="toggle-setting" checked={setting.enabled} onCheckedChange={onChange} />
        <Label htmlFor="toggle-setting">{!setting.enabled ? 'Disabled' : 'Enabled'}</Label>
      </div>
    </div>
  );
};

export default SettingCard;
