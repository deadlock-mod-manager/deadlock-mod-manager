import { CustomSettingType } from '@deadlock-mods/utils';
import { PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePersistedStore } from '@/lib/store';
import type { LocalSetting } from '@/types/settings';

const WHITESPACE_REGEX = /\s+/;

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type SettingsCardProps = {
  setting: LocalSetting | undefined;
  onChange: (newValue: boolean) => void;
};

const parseCommand = (input: string) => {
  const t = input.trim();
  const [k, ...rest] = t.split(WHITESPACE_REGEX);
  const key = (k || '').trim();
  const value = (rest.join(' ') || '').trim();
  return { key, value };
};

const Command = ({ setting }: Pick<SettingsCardProps, 'setting'>) => {
  if (!setting) {
    return null;
  }

  if (setting.type !== CustomSettingType.LAUNCH_OPTION) {
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
        <button
          className="cursor-copy bg-transparent p-0 font-mono text-sm underline decoration-dotted underline-offset-4"
          onClick={() => {
            navigator.clipboard.writeText(
              `${setting.key} ${setting.value}`.trim()
            );
            toast.success('Copied to clipboard');
          }}
          type="button"
        >
          {`${setting.key} ${setting.value}`.trim()}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Copy to clipboard</p>
      </TooltipContent>
    </Tooltip>
  );
};

export const SettingCardSkeleton = () => {
  return (
    <div className="flex flex-row items-center justify-between pl-8">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-lg">
          <Skeleton className="h-6 w-48" />
        </h3>
        <div className="text-muted-foreground text-sm">
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Switch disabled id="toggle-setting" />
        <Label htmlFor="toggle-setting">
          <Skeleton className="h-4 w-16" />
        </Label>
      </div>
    </div>
  );
};

const SettingCard = ({ setting, onChange }: SettingsCardProps) => {
  const addSetting = usePersistedStore((s) => s.addSetting);
  const removeSetting = usePersistedStore((s) => s.removeSetting);

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCmd, setEditCmd] = useState('');

  if (!setting) {
    return <SettingCardSkeleton />;
  }
  const custom = setting.id.startsWith('local_setting_');

  const openEdit = () => {
    setEditName(setting.description ?? '');
    const cmd = `${setting.key}${setting.value ? ` ${setting.value}` : ''}`;
    setEditCmd(cmd.trim());
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!custom) {
      return;
    }

    const { key, value } = parseCommand(editCmd);
    if (!key) {
      return toast.error('Command key is required');
    }
    if (setting.type === CustomSettingType.LAUNCH_OPTION && !value) {
      return toast.error('Command value is required');
    }

    const updated: LocalSetting = {
      ...setting,
      description: editName?.trim() || setting.description,
      key,
      value,
      updatedAt: new Date(),
    };

    addSetting(updated);
    setEditOpen(false);
    toast.success('Setting updated');
  };

  const deleteSetting = () => {
    if (!custom) {
      return;
    }
    removeSetting(setting.id);
    toast.success('Setting removed');
  };

  return (
    <>
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">
            {setting.description} {custom && <Badge>Custom</Badge>}
          </h3>
          <p className="text-muted-foreground text-sm">
            <Command setting={setting} />
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {custom && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Edit"
                    onClick={openEdit}
                    size="icon"
                    variant="ghost"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Delete"
                    onClick={deleteSetting}
                    size="icon"
                    variant="ghost"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}

          <Switch
            checked={setting.enabled}
            id={`toggle-setting-${setting.id}`}
            onCheckedChange={onChange}
          />
          <Label htmlFor={`toggle-setting-${setting.id}`}>
            {setting.enabled ? 'Enabled' : 'Disabled'}
          </Label>
        </div>
      </div>

      {/* dialog for custom settings */}
      <Dialog onOpenChange={setEditOpen} open={editOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit custom option</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`name-${setting.id}`}>Name</Label>
              <Input
                id={`name-${setting.id}`}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. 110 FOV"
                value={editName}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`cmd-${setting.id}`}>Command</Label>
              <Input
                id={`cmd-${setting.id}`}
                onChange={(e) => setEditCmd(e.target.value)}
                placeholder="+r_aspectratio 2.7"
                value={editCmd}
              />
              <span className="text-muted-foreground text-xs">
                Format: +cvar value (leading + is optional)
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SettingCard;
