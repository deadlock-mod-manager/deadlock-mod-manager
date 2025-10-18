import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { open } from "@tauri-apps/plugin-shell";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";
import BloodmoonTheme from "./pre-defiend/bloodmoon/bloodmoon.tsx";
import NightshiftTheme from "./pre-defiend/nightshift/nightshift.tsx";

export const manifest = {
  id: "themes",
  nameKey: "plugins.themes.title",
  descriptionKey: "plugins.themes.description",
  version: "0.0.1",
  author: "Skeptic",
  icon: "public/icon.png",
} as const;

type ThemeSettings = {
  activeSection: "pre-defined" | "custom";
  activeTheme?: string;
  customTheme?: {
    primaryColor: string;
    backgroundColor: string;
    accentColor: string;
  };
};

const DEFAULT_SETTINGS: ThemeSettings = {
  activeSection: "pre-defined",
  activeTheme: undefined,
  customTheme: {
    primaryColor: "#d4af37",
    backgroundColor: "#1a1612",
    accentColor: "#8b7355",
  },
};

const PRE_DEFINED_THEMES = [
  {
    id: "nightshift",
    name: "Nightshift",
    description: "A teal-accented cyberpunk theme with elegant UI elements",
    component: NightshiftTheme,
    previewImage:
      "/src/plugins/themes/public/pre-defiend/nightshift/preview.png",
  },
  {
    id: "bloodmoon",
    name: "Bloodmoon",
    description: "A dark theme with black-red gradients and crimson accents",
    component: BloodmoonTheme,
    previewImage:
      "/src/plugins/themes/public/pre-defiend/bloodmoon/preview.png",
  },
];

const Settings = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);
  const current = settings ?? DEFAULT_SETTINGS;

  return (
    <div className='flex flex-col gap-4 pl-4 pr-4'>
      <div className='flex gap-2 border-b pb-4'>
        <Button
          variant={
            current.activeSection === "pre-defined" ? "default" : "outline"
          }
          onClick={() =>
            setSettings(manifest.id, {
              ...current,
              activeSection: "pre-defined",
            })
          }
          className='flex-1'>
          {t("plugins.themes.preDefinedThemes")}
        </Button>
        <Button
          variant={current.activeSection === "custom" ? "default" : "outline"}
          onClick={() =>
            setSettings(manifest.id, { ...current, activeSection: "custom" })
          }
          className='flex-1'>
          {t("plugins.themes.customThemes")}
        </Button>
      </div>

      {current.activeSection === "pre-defined" ? (
        <div className='flex flex-col gap-4'>
          <p className='text-sm text-muted-foreground'>
            {t("plugins.themes.preDefinedDescription")}
          </p>

          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
            {PRE_DEFINED_THEMES.map((theme) => (
              <Card
                key={theme.id}
                className={
                  current.activeTheme === theme.id
                    ? "border-border h-full flex flex-col"
                    : "border-border h-full flex flex-col"
                }>
                <CardHeader className='min-h-[120px]'>
                  <CardTitle className='text-lg'>{theme.name}</CardTitle>
                  <CardDescription>
                    {theme.id === "nightshift"
                      ? t("plugins.nightshift.description")
                      : theme.id === "bloodmoon"
                        ? t("plugins.bloodmoon.description")
                        : theme.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-4 flex-1'>
                  <div className='relative w-full aspect-[16/9] rounded-md border overflow-hidden bg-muted'>
                    <img
                      src={theme.previewImage}
                      alt={theme.name}
                      className='absolute inset-0 h-full w-full object-cover'
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.parentElement!.innerHTML =
                          '<span class="text-muted-foreground text-xs flex items-center justify-center h-full w-full">Preview coming soon</span>';
                      }}
                    />
                  </div>

                  <div className='flex-1 flex flex-col justify-between'>
                    {theme.id === "nightshift" && (
                      <div className='text-sm text-muted-foreground mb-4'>
                        <span className='mr-2'>
                          {t("plugins.nightshift.visit")}
                        </span>
                        <a
                          className='text-primary hover:underline mr-3'
                          href='https://x.com/dlnightshift'
                          target='_blank'
                          rel='noreferrer'>
                          {t("plugins.nightshift.twitter")}
                        </a>
                        <a
                          className='text-primary hover:underline'
                          href='https://discord.gg/z3nftGA8'
                          target='_blank'
                          rel='noreferrer'>
                          {t("plugins.nightshift.discord")}
                        </a>
                      </div>
                    )}

                    {theme.id === "bloodmoon" && (
                      <div className='text-sm text-muted-foreground mb-4'>
                        <span className='mr-1'>
                          {t("plugins.bloodmoon.visit")
                            .replace("Skeptic", "")
                            .trim()}
                        </span>
                        <button
                          className='text-primary hover:underline'
                          onClick={(e) => {
                            e.stopPropagation();
                            void open("https://github.com/Skeptic-systems");
                          }}
                          type='button'>
                          Skeptic
                        </button>
                      </div>
                    )}

                    <div className='flex gap-2'>
                      {current.activeTheme === theme.id ? (
                        <Button
                          variant='destructive'
                          onClick={() =>
                            setSettings(manifest.id, {
                              ...current,
                              activeTheme: undefined,
                            })
                          }
                          className='flex-1'>
                          {t("plugins.themes.deactivate")}
                        </Button>
                      ) : (
                        <Button
                          variant='default'
                          onClick={() =>
                            setSettings(manifest.id, {
                              ...current,
                              activeTheme: theme.id,
                            })
                          }
                          className='flex-1'>
                          {t("plugins.themes.activate")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-4'>
          <p className='text-sm text-muted-foreground'>
            {t("plugins.themes.customDescription")}
          </p>

          <Card>
            <CardHeader>
              <CardTitle>{t("plugins.themes.customThemeBuilder")}</CardTitle>
              <CardDescription>
                {t("plugins.themes.customThemeBuilderDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className='text-sm text-muted-foreground text-center py-8'>
                Custom theme builder coming soon...
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer indicator removed intentionally */}
    </div>
  );
};

const Render = () => {
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | ThemeSettings
    | undefined;
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[manifest.id] ?? false,
  );
  const setEnabledPlugin = usePersistedStore((s) => s.setEnabledPlugin);
  const current = settings ?? DEFAULT_SETTINGS;

  useEffect(() => {
    if (!isEnabled) return;

    if (current.activeTheme) {
      setEnabledPlugin("background", false);
    }

    return () => {};
  }, [isEnabled, current.activeTheme, setEnabledPlugin]);

  if (!isEnabled || !current.activeTheme) return null;

  const activeTheme = PRE_DEFINED_THEMES.find(
    (theme) => theme.id === current.activeTheme,
  );

  if (!activeTheme || !activeTheme.component) return null;

  const ThemeComponent = activeTheme.component;

  return <ThemeComponent />;
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
};

export default mod;
