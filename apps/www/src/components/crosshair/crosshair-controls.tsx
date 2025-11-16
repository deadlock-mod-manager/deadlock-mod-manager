import type {
  CrosshairConfig,
  HerosWithCrosshairOverrides,
} from "@deadlock-mods/crosshair/types";
import { DeadlockHeroes } from "@deadlock-mods/shared";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { ColorPicker } from "./color-picker";

interface CrosshairControlsProps {
  config: CrosshairConfig;
  onChange: (config: CrosshairConfig) => void;
}

export function CrosshairControls({
  config,
  onChange,
}: CrosshairControlsProps) {
  const updateConfig = (updates: Partial<CrosshairConfig>) => {
    onChange({ ...config, ...updates });
  };

  return (
    <div className='space-y-6'>
      <div className='space-y-4'>
        <h3 className='text-lg font-semibold'>Crosshair Settings</h3>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='gap-slider'>Gap</Label>
            <Input
              type='number'
              value={config.gap}
              onChange={(e) =>
                updateConfig({ gap: Number.parseFloat(e.target.value) || 0 })
              }
              className='w-20 h-8 text-sm'
              step={1}
              min={-20}
              max={50}
            />
          </div>
          <Slider
            id='gap-slider'
            min={-20}
            max={50}
            step={1}
            value={[config.gap]}
            onValueChange={([value]) => updateConfig({ gap: value })}
          />
        </div>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='width-slider'>Width</Label>
            <Input
              type='number'
              value={config.width}
              onChange={(e) =>
                updateConfig({ width: Number.parseFloat(e.target.value) || 0 })
              }
              className='w-20 h-8 text-sm'
              step={0.1}
              min={0}
              max={100}
            />
          </div>
          <Slider
            id='width-slider'
            min={0}
            max={100}
            step={0.1}
            value={[config.width]}
            onValueChange={([value]) => updateConfig({ width: value })}
          />
        </div>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='height-slider'>Height</Label>
            <Input
              type='number'
              value={config.height}
              onChange={(e) =>
                updateConfig({ height: Number.parseFloat(e.target.value) || 0 })
              }
              className='w-20 h-8 text-sm'
              step={0.1}
              min={0}
              max={100}
            />
          </div>
          <Slider
            id='height-slider'
            min={0}
            max={100}
            step={0.1}
            value={[config.height]}
            onValueChange={([value]) => updateConfig({ height: value })}
          />
        </div>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='pip-opacity-slider'>Pip Opacity</Label>
            <Input
              type='number'
              value={config.pipOpacity}
              onChange={(e) =>
                updateConfig({
                  pipOpacity: Number.parseFloat(e.target.value) || 0,
                })
              }
              className='w-20 h-8 text-sm'
              step={0.1}
              min={0}
              max={1}
            />
          </div>
          <Slider
            id='pip-opacity-slider'
            min={0}
            max={1}
            step={0.1}
            value={[config.pipOpacity]}
            onValueChange={([value]) => updateConfig({ pipOpacity: value })}
          />
        </div>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='dot-opacity-slider'>Dot Opacity</Label>
            <Input
              type='number'
              value={config.dotOpacity}
              onChange={(e) =>
                updateConfig({
                  dotOpacity: Number.parseFloat(e.target.value) || 0,
                })
              }
              className='w-20 h-8 text-sm'
              step={0.1}
              min={0}
              max={1}
            />
          </div>
          <Slider
            id='dot-opacity-slider'
            min={0}
            max={1}
            step={0.1}
            value={[config.dotOpacity]}
            onValueChange={([value]) => updateConfig({ dotOpacity: value })}
          />
        </div>

        <div className='space-y-2'>
          <div className='flex justify-between items-center'>
            <Label htmlFor='dot-outline-opacity-slider'>
              Dot Outline Opacity
            </Label>
            <Input
              type='number'
              value={config.dotOutlineOpacity}
              onChange={(e) =>
                updateConfig({
                  dotOutlineOpacity: Number.parseFloat(e.target.value) || 0,
                })
              }
              className='w-20 h-8 text-sm'
              step={0.1}
              min={0}
              max={1}
            />
          </div>
          <Slider
            id='dot-outline-opacity-slider'
            min={0}
            max={1}
            step={0.1}
            value={[config.dotOutlineOpacity]}
            onValueChange={([value]) =>
              updateConfig({ dotOutlineOpacity: value })
            }
          />
        </div>
      </div>

      <div className='space-y-4'>
        <h3 className='text-lg font-semibold'>Color</h3>
        <ColorPicker
          color={config.color}
          onChange={(color) => updateConfig({ color })}
        />
      </div>

      <div className='space-y-4'>
        <h3 className='text-lg font-semibold'>Options</h3>

        <div className='flex items-center space-x-2'>
          <Checkbox
            id='pip-border'
            checked={config.pipBorder}
            onCheckedChange={(checked) =>
              updateConfig({ pipBorder: !!checked })
            }
          />
          <Label htmlFor='pip-border' className='cursor-pointer'>
            Show pip border
          </Label>
        </div>

        <div className='flex items-center space-x-2'>
          <Checkbox
            id='pip-gap-static'
            checked={config.pipGapStatic}
            onCheckedChange={(checked) =>
              updateConfig({ pipGapStatic: !!checked })
            }
          />
          <Label htmlFor='pip-gap-static' className='cursor-pointer'>
            Static pip gap
          </Label>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='hero-select'>Hero</Label>
          <Select
            value={config.hero}
            onValueChange={(hero: HerosWithCrosshairOverrides) =>
              updateConfig({ hero })
            }>
            <SelectTrigger id='hero-select'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='Default'>Default</SelectItem>
              <SelectItem value={DeadlockHeroes.Abrams}>
                {DeadlockHeroes.Abrams}
              </SelectItem>
              <SelectItem value={DeadlockHeroes.Yamato}>
                {DeadlockHeroes.Yamato}
              </SelectItem>
              <SelectItem value={DeadlockHeroes.Shiv}>
                {DeadlockHeroes.Shiv}
              </SelectItem>
              <SelectItem value={DeadlockHeroes.MoKrill}>
                {DeadlockHeroes.MoKrill}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
