import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";
import {
  beginEditingUserTheme,
  type CustomExportedTheme,
  CustomTheme,
  cancelEditingUserTheme,
  deleteUserTheme,
  ExportCustomThemeButton,
  getUserThemes,
  LineColorPicker,
  saveEditingUserTheme,
  type ThemeSettings,
} from "./custom";
import {
  ArcaneAccentPicker,
  DEFAULT_ACCENT_COLOR,
} from "./pre-defined/arcane/accent-picker.tsx";
import ArcaneTheme from "./pre-defined/arcane/arcane.tsx";
import BloodmoonTheme from "./pre-defined/bloodmoon/bloodmoon.tsx";
import NightshiftTheme from "./pre-defined/nightshift/nightshift.tsx";
import TeaTheme from "./pre-defined/tea/tea.tsx";

const arcanePreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/arcane/preview.png",
);
const nightshiftPreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/nightshift/preview.png",
);
const bloodmoonPreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/bloodmoon/preview.png",
);
const teaPreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/tea/preview.png",
);

export const manifest = {
  id: "themes",
  nameKey: "plugins.themes.title",
  descriptionKey: "plugins.themes.themeDescription",
  version: "0.0.1",
  author: "Skeptic",
  icon: "public/icon.png",
} as const;

export type { ThemeSettings };

const DEFAULT_SETTINGS: ThemeSettings = {
  activeSection: "pre-defined",
  activeTheme: undefined,
  customTheme: {
    lineColor: "#6b7280",
    iconData: "",
    backgroundSource: "url",
    backgroundUrl: "",
    backgroundData: "",
    backgroundOpacity: 30,
  },
};

const PRE_DEFINED_THEMES = [
  {
    id: "nightshift",
    name: "Nightshift",
    description: "A teal-accented cyberpunk theme with elegant UI elements",
    descriptionKey: "plugins.nightshift.description",
    component: NightshiftTheme,
    previewImage: nightshiftPreview,
  },
  {
    id: "bloodmoon",
    name: "Bloodmoon",
    description: "A dark theme with black-red gradients and crimson accents",
    descriptionKey: "plugins.bloodmoon.description",
    component: BloodmoonTheme,
    previewImage: bloodmoonPreview,
  },
  {
    id: "tea",
    name: "Tea",
    description: "A cozy beige theme celebrating Snipztea.",
    descriptionKey: "plugins.tea.description",
    component: TeaTheme,
    previewImage: teaPreview,
  },
  {
    id: "arcane",
    name: "Arcane",
    description: "A sleek dark theme with elegant pink-red glow effects.",
    descriptionKey: "plugins.arcane.description",
    component: ArcaneTheme,
    previewImage: arcanePreview,
  },
] as const;

const Settings = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);
  const current = settings ?? DEFAULT_SETTINGS;

  return (
    <div className='flex flex-col gap-4 pb-20'>
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
            {[...getUserThemes(current), ...PRE_DEFINED_THEMES].map((theme) => (
              <Card
                key={theme.id}
                className={
                  current.activeTheme === theme.id
                    ? "border-border h-full flex flex-col"
                    : "border-border h-full flex flex-col"
                }>
                <CardHeader className='min-h-[120px]'>
                  <div className='flex items-center justify-between'>
                    <CardTitle className='text-lg'>
                      {"userCreated" in theme && theme.userCreated
                        ? (theme as CustomExportedTheme).name
                        : (theme as { name: string }).name}
                    </CardTitle>
                    <div className='flex items-center gap-2'>
                      <Switch
                        checked={current.activeTheme === theme.id}
                        onCheckedChange={(checked) =>
                          setSettings(manifest.id, {
                            ...current,
                            activeTheme: checked ? theme.id : undefined,
                          })
                        }
                      />
                      <label
                        className='text-sm font-medium cursor-pointer'
                        onClick={() =>
                          setSettings(manifest.id, {
                            ...current,
                            activeTheme:
                              current.activeTheme === theme.id
                                ? undefined
                                : theme.id,
                          })
                        }>
                        {current.activeTheme === theme.id
                          ? t("plugins.themes.active")
                          : t("plugins.themes.inactive")}
                      </label>
                    </div>
                  </div>
                  <CardDescription>
                    {"userCreated" in theme && theme.userCreated
                      ? ((theme as CustomExportedTheme).description ?? "")
                      : "descriptionKey" in theme && theme.descriptionKey
                        ? t(theme.descriptionKey)
                        : theme.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-4 flex-1'>
                  <div className='relative w-full aspect-[16/9] rounded-md border overflow-hidden bg-muted'>
                    {"userCreated" in theme && theme.userCreated ? (
                      (theme as CustomExportedTheme).previewData ? (
                        <img
                          src={(theme as CustomExportedTheme).previewData!}
                          alt={(theme as CustomExportedTheme).name}
                          className='absolute inset-0 h-full w-full object-cover'
                        />
                      ) : (
                        <span className='text-muted-foreground text-xs flex items-center justify-center h-full w-full'>
                          {t("plugins.themes.noPreview")}
                        </span>
                      )
                    ) : (
                      <img
                        src={(theme as { previewImage: string }).previewImage}
                        alt={(theme as { name: string }).name}
                        className='absolute inset-0 h-full w-full object-cover'
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          e.currentTarget.parentElement!.innerHTML = `<span class="text-muted-foreground text-xs flex items-center justify-center h-full w-full">${t("plugins.themes.previewComingSoon")}</span>`;
                        }}
                      />
                    )}
                  </div>

                  <div className='flex-1 flex flex-col justify-between'>
                    {"userCreated" in theme && theme.userCreated ? (
                      (theme as CustomExportedTheme).subDescription ? (
                        <div className='text-sm text-muted-foreground mb-4'>
                          {(theme as CustomExportedTheme).subDescription}
                        </div>
                      ) : null
                    ) : theme.id === "tea" ? (
                      <div className='text-sm text-muted-foreground mb-4'>
                        <span className='mr-3'>{t("plugins.tea.visit")}</span>
                        <button
                          className='text-primary hover:underline inline-flex items-center mr-3'
                          onClick={(e) => {
                            e.stopPropagation();
                            void open("https://www.twitch.tv/snipztea");
                          }}
                          type='button'>
                          {t("plugins.tea.twitch")}
                        </button>
                        <button
                          className='text-primary hover:underline inline-flex items-center'
                          onClick={(e) => {
                            e.stopPropagation();
                            void open("https://snipztea.carrd.co/");
                          }}
                          type='button'>
                          {t("plugins.tea.carrd")}
                        </button>
                      </div>
                    ) : theme.id === "nightshift" ? (
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
                    ) : theme.id === "bloodmoon" ? (
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
                    ) : theme.id === "arcane" ? (
                      <div className='mb-4'>
                        <div className='text-sm text-muted-foreground mb-2'>
                          <span className='mr-1'>
                            {t("plugins.arcane.visit")
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
                        <ArcaneAccentPicker
                          value={
                            current.arcaneAccentColor ?? DEFAULT_ACCENT_COLOR
                          }
                          customColors={current.arcaneCustomColors ?? []}
                          onChange={(color) =>
                            setSettings(manifest.id, {
                              ...current,
                              arcaneAccentColor: color,
                            })
                          }
                          onAddCustomColor={(color) => {
                            const existing = current.arcaneCustomColors ?? [];
                            if (!existing.includes(color)) {
                              setSettings(manifest.id, {
                                ...current,
                                arcaneCustomColors: [...existing, color],
                              });
                            }
                          }}
                        />
                      </div>
                    ) : null}

                    <div className='flex items-center gap-2'>
                      {"userCreated" in theme && theme.userCreated ? (
                        <>
                          <Button
                            variant='outline'
                            onClick={() =>
                              beginEditingUserTheme(
                                (theme as CustomExportedTheme).id,
                              )
                            }>
                            {t("plugins.themes.edit")}
                          </Button>
                          <Button
                            variant='outline'
                            onClick={() =>
                              deleteUserTheme((theme as CustomExportedTheme).id)
                            }>
                            {t("plugins.themes.delete")}
                          </Button>
                        </>
                      ) : null}
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
              <div className='flex items-center justify-between'>
                <CardTitle>{t("plugins.themes.customThemeBuilder")}</CardTitle>
                <div className='flex items-center gap-2'>
                  <Switch
                    checked={current.activeTheme === "custom"}
                    onCheckedChange={(checked) =>
                      setSettings(manifest.id, {
                        ...current,
                        activeTheme: checked ? "custom" : undefined,
                      })
                    }
                  />
                  <label
                    className='text-sm font-medium cursor-pointer'
                    onClick={() =>
                      setSettings(manifest.id, {
                        ...current,
                        activeTheme:
                          current.activeTheme === "custom"
                            ? undefined
                            : "custom",
                      })
                    }>
                    {current.activeTheme === "custom"
                      ? t("plugins.themes.active")
                      : t("plugins.themes.inactive")}
                  </label>
                </div>
              </div>
              <CardDescription>
                {t("plugins.themes.customThemeBuilderDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-4 grid-cols-1 sm:grid-cols-2'>
                <LineColorPicker
                  value={current.customTheme?.lineColor ?? "#6b7280"}
                  onChange={(hex) =>
                    setSettings(manifest.id, {
                      ...current,
                      customTheme: {
                        ...current.customTheme!,
                        lineColor: hex,
                      },
                    })
                  }
                />

                <div className='space-y-3'>
                  <div className='flex items-center gap-3'>
                    <label className='text-sm font-medium'>
                      {t("plugins.themes.themeIcon")}
                    </label>
                    <input
                      accept='image/*'
                      id='custom-theme-icon-input'
                      type='file'
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = reader.result as string;
                          setSettings(manifest.id, {
                            ...current,
                            customTheme: {
                              ...current.customTheme!,
                              iconData: dataUrl,
                            },
                          });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <Button
                      variant='outline'
                      onClick={() =>
                        document
                          .getElementById("custom-theme-icon-input")
                          ?.click()
                      }>
                      {t("plugins.themes.chooseIcon")}
                    </Button>
                    {current.customTheme?.iconData ? (
                      <img
                        alt={t("plugins.themes.themeIconAlt")}
                        src={current.customTheme.iconData}
                        className='h-8 w-8 rounded'
                      />
                    ) : null}
                  </div>
                </div>

                <div className='space-y-3 sm:col-span-2'>
                  <label className='text-sm font-medium'>
                    {t("plugins.themes.backgroundImage")}
                  </label>
                  <div className='flex flex-col gap-3'>
                    <input
                      placeholder={t("plugins.themes.backgroundUrlPlaceholder")}
                      value={
                        current.customTheme?.backgroundSource === "url"
                          ? (current.customTheme?.backgroundUrl ?? "")
                          : ""
                      }
                      onChange={(e) =>
                        setSettings(manifest.id, {
                          ...current,
                          customTheme: {
                            ...current.customTheme!,
                            backgroundSource: "url",
                            backgroundUrl: e.target.value,
                          },
                        })
                      }
                      className='flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm'
                    />
                    <div className='flex items-center gap-3'>
                      <input
                        accept='image/*'
                        id='custom-theme-bg-input'
                        type='file'
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = reader.result as string;
                            setSettings(manifest.id, {
                              ...current,
                              customTheme: {
                                ...current.customTheme!,
                                backgroundSource: "local",
                                backgroundData: dataUrl,
                                backgroundUrl: "",
                              },
                            });
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <Button
                        variant='outline'
                        onClick={() =>
                          document
                            .getElementById("custom-theme-bg-input")
                            ?.click()
                        }>
                        {t("plugins.themes.chooseImage")}
                      </Button>
                      <div className='flex items-center gap-2'>
                        <span className='text-sm'>
                          {t("plugins.themes.opacity")}
                        </span>
                        <input
                          type='range'
                          min={0}
                          max={100}
                          value={current.customTheme?.backgroundOpacity ?? 30}
                          onChange={(e) =>
                            setSettings(manifest.id, {
                              ...current,
                              customTheme: {
                                ...current.customTheme!,
                                backgroundOpacity: Number(e.target.value),
                              },
                            })
                          }
                        />
                        <span className='text-xs text-muted-foreground w-8'>
                          {current.customTheme?.backgroundOpacity ?? 30}%
                        </span>
                      </div>
                    </div>
                    {(current.customTheme?.backgroundSource === "local" &&
                      current.customTheme?.backgroundData) ||
                    (current.customTheme?.backgroundSource === "url" &&
                      current.customTheme?.backgroundUrl) ? (
                      <div className='relative w-full aspect-[16/9] rounded-md border overflow-hidden bg-muted'>
                        <img
                          src={
                            current.customTheme?.backgroundSource === "local"
                              ? current.customTheme?.backgroundData
                              : current.customTheme?.backgroundUrl
                          }
                          alt={t("plugins.themes.customBackgroundAlt")}
                          className='absolute inset-0 h-full w-full object-cover'
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className='mt-6 flex items-center gap-2'>
                <ExportCustomThemeButton />
                <Button
                  variant='outline'
                  onClick={() =>
                    setSettings(manifest.id, {
                      ...current,
                      customTheme: DEFAULT_SETTINGS.customTheme,
                    })
                  }>
                  {t("plugins.themes.clear")}
                </Button>
                {current.editingThemeId ? (
                  <>
                    <Button
                      variant='default'
                      onClick={() => saveEditingUserTheme()}>
                      {t("plugins.themes.save")}
                    </Button>
                    <Button
                      variant='outline'
                      onClick={() => cancelEditingUserTheme()}>
                      {t("plugins.themes.cancel")}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Spacer to avoid overlap with bottom status bar */}
      <div className='h-12' />
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
  const current = settings ?? DEFAULT_SETTINGS;

  if (!isEnabled || !current.activeTheme) return null;

  // Render exported user-defined themes via CustomTheme override
  const userTheme = getUserThemes(current).find(
    (t) => t.id === current.activeTheme,
  );
  if (userTheme) {
    return <CustomTheme theme={userTheme} />;
  }

  if (current.activeTheme === "custom") {
    return <CustomTheme />;
  }

  // Special handling for Arcane theme to pass accent color
  if (current.activeTheme === "arcane") {
    return (
      <ArcaneTheme
        accentColor={current.arcaneAccentColor ?? DEFAULT_ACCENT_COLOR}
      />
    );
  }

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
