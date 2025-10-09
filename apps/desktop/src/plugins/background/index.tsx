import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Slider } from "@deadlock-mods/ui/components/slider";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

export const manifest = {
  id: "background",
  nameKey: "plugins.background.title",
  descriptionKey: "plugins.background.description",
  version: "1.0.0",
  author: "community",
  icon: "public/icon.svg",
} as const;

type BgSettings = {
  imageUrl: string;
  imageData?: string;
  sourceType?: "url" | "local";
  opacity: number;
  blur: number; // px
  includeSidebar?: boolean;
};

const DEFAULT_SETTINGS: BgSettings = {
  imageUrl: "",
  imageData: "",
  sourceType: "url",
  opacity: 25,
  blur: 0,
  includeSidebar: false,
};

const Settings = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | BgSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);

  const current = settings ?? DEFAULT_SETTINGS;

  return (
    <div className='flex flex-col gap-4 pl-4'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='bg-image-url'>
          {t(`plugins.${manifest.id}.imageUrl`)}
        </Label>
        <Input
          id='bg-image-url'
          onChange={(e) =>
            setSettings(manifest.id, {
              ...current,
              sourceType: "url",
              imageUrl: e.target.value,
            })
          }
          placeholder='https://example.com/background.jpg'
          value={current.sourceType === "url" ? current.imageUrl : ""}
        />
      </div>

      <div className='flex items-center gap-4 mt-2'>
        <div className='flex-1'>
          <Label className='pl-1 sm:pl-2' htmlFor='bg-opacity'>
            {t(`plugins.${manifest.id}.opacity`)} ({current.opacity}%)
          </Label>
          <Slider
            className='w-full mt-2'
            id='bg-opacity'
            max={100}
            min={0}
            onValueChange={(v) =>
              setSettings(manifest.id, { ...current, opacity: v[0] })
            }
            step={1}
            value={[current.opacity]}
          />
        </div>
      </div>

      <div className='flex items-center gap-4 mt-2'>
        <div className='flex-1'>
          <Label className='pl-1 sm:pl-2' htmlFor='bg-blur'>
            {t(`plugins.${manifest.id}.blur`)} ({current.blur}px)
          </Label>
          <Slider
            className='w-full mt-2'
            id='bg-blur'
            max={20}
            min={0}
            onValueChange={(v) =>
              setSettings(manifest.id, { ...current, blur: v[0] })
            }
            step={1}
            value={[current.blur]}
          />
        </div>
      </div>

      <div className='flex items-center justify-between mt-2 pr-2'>
        <div className='space-y-1'>
          <Label className='pl-1 sm:pl-2' htmlFor='bg-include-sidebar'>
            {t(`plugins.${manifest.id}.includeSidebar`)}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <input
            aria-checked={!!current.includeSidebar}
            className='sr-only'
            id='bg-include-sidebar'
            readOnly
            role='switch'
            type='checkbox'
            value={current.includeSidebar ? "on" : "off"}
          />
          {/* reuse Switch component styling via a controlled Slider alternative not necessary; use a button */}
          <button
            aria-pressed={!!current.includeSidebar}
            className='inline-flex h-6 w-11 items-center rounded-full bg-secondary transition-colors data-[state=on]:bg-primary'
            data-state={current.includeSidebar ? "on" : "off"}
            onClick={() =>
              setSettings(manifest.id, {
                ...current,
                includeSidebar: !current.includeSidebar,
              })
            }
            type='button'>
            <span
              className='inline-block h-5 w-5 translate-x-1 rounded-full bg-background shadow transition-transform data-[state=on]:translate-x-5'
              data-state={current.includeSidebar ? "on" : "off"}
            />
          </button>
        </div>
      </div>

      <div className='flex gap-2 mt-2'>
        <input
          accept='image/*'
          id='bg-file-input'
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              setSettings(manifest.id, {
                ...current,
                sourceType: "local",
                imageData: dataUrl,
                imageUrl: "",
              });
            };
            reader.readAsDataURL(file);
          }}
          style={{ display: "none" }}
          type='file'
        />
        <Button
          onClick={() => document.getElementById("bg-file-input")?.click()}
          variant='outline'>
          {t(`plugins.${manifest.id}.chooseImage`)}
        </Button>
      </div>
    </div>
  );
};

const Render = () => {
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | BgSettings
    | undefined;
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[manifest.id] ?? false,
  );
  const current = settings ?? DEFAULT_SETTINGS;
  const [mounted, setMounted] = useState(false);

  const style = useMemo<CSSProperties>(() => {
    const chosen =
      current.sourceType === "local" ? current.imageData : current.imageUrl;
    if (!chosen) return { display: "none" };
    return {
      position: "fixed",
      top: 0,
      right: 0,
      bottom: 0,
      // If includeSidebar is false, offset the background so it doesn't cover the sidebar
      left: current.includeSidebar ? 0 : "12rem",
      backgroundImage: `url(${chosen})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      pointerEvents: "none",
      opacity: current.opacity / 100,
      filter: current.blur ? `blur(${current.blur}px)` : undefined,
      zIndex: 0,
    };
  }, [
    current.sourceType,
    current.imageUrl,
    current.imageData,
    current.opacity,
    current.blur,
    current.includeSidebar,
  ]);

  useEffect(() => setMounted(true), []);
  if (!mounted || !isEnabled) return null;

  const node = <div aria-hidden style={style} />;
  return createPortal(node, document.body);
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
};

export default mod;
