import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { open } from "@tauri-apps/plugin-shell";
import { useTranslation } from "react-i18next";
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
} from "./custom";
import BloodmoonTheme from "./pre-defiend/bloodmoon/bloodmoon.tsx";
import NightshiftTheme from "./pre-defiend/nightshift/nightshift.tsx";
import TeaTheme from "./pre-defiend/tea/tea.tsx";

export const manifest = {
  id: "themes",
  nameKey: "plugins.themes.title",
  descriptionKey: "plugins.themes.themeDescription",
  version: "0.0.1",
  author: "Skeptic",
  icon: "public/icon.png",
} as const;

export type ThemeSettings = {
  activeSection: "pre-defined" | "custom";
  activeTheme?: string;
  customTheme?: {
    lineColor: string;
    iconData?: string;
    backgroundSource?: "url" | "local";
    backgroundUrl?: string;
    backgroundData?: string;
    backgroundOpacity?: number;
  };
};

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
  {
    id: "tea",
    name: "Tea",
    description: "A cozy beige theme celebrating Snipztea.",
    component: TeaTheme,
    previewImage: "/src/plugins/themes/public/pre-defiend/tea/preview.png",
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
    <div className='flex flex-col gap-4 pl-4 pr-4 pb-20'>
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
                  <CardTitle className='text-lg'>
                    {"userCreated" in theme && theme.userCreated
                      ? (theme as CustomExportedTheme).name
                      : (theme as { name: string }).name}
                  </CardTitle>
                  <CardDescription>
                    {"userCreated" in theme && theme.userCreated
                      ? ((theme as CustomExportedTheme).description ?? "")
                      : theme.id === "tea"
                        ? t("plugins.tea.description")
                        : theme.id === "nightshift"
                          ? t("plugins.nightshift.description")
                          : theme.id === "bloodmoon"
                            ? t("plugins.bloodmoon.description")
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
                          e.currentTarget.parentElement!.innerHTML =
                            `<span class="text-muted-foreground text-xs flex items-center justify-center h-full w-full">${t("plugins.themes.previewComingSoon")}</span>`;
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
                    ) : null}

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
              <CardTitle>{t("plugins.themes.customThemeBuilder")}</CardTitle>
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
                        alt='theme icon'
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
                          alt='custom background'
                          className='absolute inset-0 h-full w-full object-cover'
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className='mt-6 flex gap-2'>
                {current.activeTheme === "custom" ? (
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
                        activeTheme: "custom",
                      })
                    }
                    className='flex-1'>
                    {t("plugins.themes.activate")}
                  </Button>
                )}
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
                {"editingThemeId" in current && current.editingThemeId ? (
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
