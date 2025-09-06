import { usePersistedStore } from '@/lib/store';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

const PrivacySettings = () => {
  const { nsfwSettings, updateNSFWSettings } = usePersistedStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">Hide NSFW Content</Label>
          <div className="text-muted-foreground text-sm">
            Completely hide mods marked as NSFW from lists and search results
          </div>
        </div>
        <Switch
          checked={nsfwSettings.hideNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ hideNSFW: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">Show Likely NSFW Content</Label>
          <div className="text-muted-foreground text-sm">
            Show content that might be NSFW but isn't explicitly marked
            (overrides hiding)
          </div>
        </div>
        <Switch
          checked={nsfwSettings.showLikelyNSFW}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ showLikelyNSFW: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">Disable NSFW Blur</Label>
          <div className="text-muted-foreground text-sm">
            Show NSFW content without any blur effect (content still shows NSFW
            badge)
          </div>
        </div>
        <Switch
          checked={nsfwSettings.disableBlur}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ disableBlur: checked })
          }
        />
      </div>

      {!nsfwSettings.disableBlur && (
        <div className="space-y-3">
          <div className="space-y-0.5">
            <Label className="text-base">Blur Strength</Label>
            <div className="text-muted-foreground text-sm">
              How much to blur NSFW content when visible (pixels)
            </div>
          </div>
          <div className="px-3">
            <Slider
              className="w-full"
              max={32}
              min={4}
              onValueChange={([value]) =>
                updateNSFWSettings({ blurStrength: value })
              }
              step={2}
              value={[nsfwSettings.blurStrength]}
            />
            <div className="mt-1 flex justify-between text-muted-foreground text-xs">
              <span>4px</span>
              <span>{nsfwSettings.blurStrength}px</span>
              <span>32px</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base">Remember Per-Item Choices</Label>
          <div className="text-muted-foreground text-sm">
            Remember when you choose to show/hide specific NSFW items
          </div>
        </div>
        <Switch
          checked={nsfwSettings.rememberPerItemOverrides}
          onCheckedChange={(checked) =>
            updateNSFWSettings({ rememberPerItemOverrides: checked })
          }
        />
      </div>
    </div>
  );
};

export default PrivacySettings;
