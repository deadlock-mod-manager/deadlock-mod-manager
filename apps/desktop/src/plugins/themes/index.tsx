import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getPluginAssetUrl } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";
import {
  beginEditingUserTheme,
  type CustomExportedTheme,
  CustomTheme,
  cancelEditingUserTheme,
  DEFAULT_CUSTOM_THEME,
  deleteUserTheme,
  ExportCustomThemeButton,
  getUserThemes,
  mergeCustomThemePalette,
  saveEditingUserTheme,
  type ThemeSettings,
  ThemePreviewSkeleton,
  ThemeSettingsPanel,
} from "./custom";
import {
  ArcaneAccentPicker,
  DEFAULT_ACCENT_COLOR,
} from "./pre-defined/arcane/accent-picker.tsx";
import ArcaneTheme from "./pre-defined/arcane/arcane.tsx";
import BloodmoonTheme from "./pre-defined/bloodmoon/bloodmoon.tsx";
import DeadlockApiTheme from "./pre-defined/deadlock-api/deadlock-api.tsx";
import NightshiftTheme from "./pre-defined/nightshift/nightshift.tsx";
import TeaTheme from "./pre-defined/tea/tea.tsx";

const arcanePreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/arcane/preview.png",
);
const deadlockApiPreview = getPluginAssetUrl(
  "themes",
  "public/pre-defined/deadlock-api/preview.png",
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
  customTheme: DEFAULT_CUSTOM_THEME,
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
  {
    id: "deadlock-api",
    name: "Deadlock API",
    description: "OLED black theme with electric red glow effects.",
    descriptionKey: "plugins.deadlockApi.description",
    component: DeadlockApiTheme,
    previewImage: deadlockApiPreview,
  },
] as const;

const APPLY_DRAFT_GRACE_MS = 15_000;

function revertDraftTheme() {
  const state = usePersistedStore.getState();
  const raw = state.pluginSettings[manifest.id] as ThemeSettings | undefined;
  if (raw?.activeTheme === "custom") {
    state.setPluginSettings(manifest.id, {
      ...raw,
      activeTheme: undefined,
    });
  }
}

const Settings = () => {
  const { t } = useTranslation();
  const settings = usePersistedStore((s) => s.pluginSettings[manifest.id]) as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);
  const current = settings ?? DEFAULT_SETTINGS;

  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const startGraceTimer = useCallback(() => {
    clearGraceTimer();
    const toastId = toast(t("plugins.themes.applyDraftGraceHint"), {
      duration: APPLY_DRAFT_GRACE_MS,
      action: {
        label: t("plugins.themes.applyDraftConfirmKeep"),
        onClick: () => {
          clearGraceTimer();
        },
      },
    });
    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      toast.dismiss(toastId);
      revertDraftTheme();
    }, APPLY_DRAFT_GRACE_MS);
  }, [t, clearGraceTimer]);

  useEffect(() => {
    clearGraceTimer();
  }, [current.activeTheme, clearGraceTimer]);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4 pb-20'>
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
                            void openUrl("https://www.twitch.tv/snipztea");
                          }}
                          type='button'>
                          {t("plugins.tea.twitch")}
                        </button>
                        <button
                          className='text-primary hover:underline inline-flex items-center'
                          onClick={(e) => {
                            e.stopPropagation();
                            void openUrl("https://snipztea.carrd.co/");
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
                            void openUrl("https://github.com/Skeptic-systems");
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
                              void openUrl(
                                "https://github.com/Skeptic-systems",
                              );
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
                    ) : theme.id === "deadlock-api" ? (
                      <div className='text-sm text-muted-foreground mb-4'>
                        <span className='mr-2'>
                          {t("plugins.deadlockApi.visit")}
                        </span>
                        <button
                          className='text-primary hover:underline inline-flex items-center mr-3'
                          onClick={(e) => {
                            e.stopPropagation();
                            void openUrl("https://deadlock-api.com/");
                          }}
                          type='button'>
                          {t("plugins.deadlockApi.website")}
                        </button>
                        <button
                          className='text-primary hover:underline inline-flex items-center'
                          onClick={(e) => {
                            e.stopPropagation();
                            void openUrl("https://discord.gg/pqWQfTPQJu");
                          }}
                          type='button'>
                          {t("plugins.deadlockApi.discord")}
                        </button>
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
        <div className='flex min-h-0 flex-1 flex-col gap-3'>
          <Card className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <CardHeader className='shrink-0 border-b border-border/70 px-4 py-3 sm:px-5'>
              <CardTitle>{t("plugins.themes.customThemeBuilder")}</CardTitle>
            </CardHeader>
            <CardContent className='flex min-h-0 flex-1 flex-col overflow-hidden p-0'>
              <div className='grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(260px,min(380px,38vw))_minmax(0,1fr)] xl:min-h-[min(400px,52vh)]'>
                <div className='flex min-h-0 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-r xl:border-border'>
                  <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5'>
                    <ThemeSettingsPanel
                      palette={mergeCustomThemePalette(current.customTheme)}
                      onPaletteChange={(patch) =>
                        setSettings(manifest.id, {
                          ...current,
                          customTheme: mergeCustomThemePalette({
                            ...current.customTheme,
                            ...patch,
                          }),
                        })
                      }
                    />
                  </div>
                </div>
                <div className='isolate flex min-h-0 min-w-0 flex-1 flex-col bg-muted/10 p-3 sm:p-4 xl:p-5'>
                  <ThemePreviewSkeleton
                    palette={mergeCustomThemePalette(current.customTheme)}
                  />
                </div>
              </div>
              <div className='flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5'>
                <Button
                  size='sm'
                  type='button'
                  variant={
                    current.activeTheme === "custom" ? "secondary" : "outline"
                  }
                  onClick={() => {
                    const nextActiveTheme =
                      current.activeTheme === "custom" ? undefined : "custom";
                    setSettings(manifest.id, {
                      ...current,
                      activeTheme: nextActiveTheme,
                    });
                    if (nextActiveTheme === "custom") {
                      startGraceTimer();
                    } else {
                      clearGraceTimer();
                    }
                  }}>
                  {current.activeTheme === "custom"
                    ? t("plugins.themes.draftActive")
                    : t("plugins.themes.applyDraft")}
                </Button>
                <ExportCustomThemeButton />
                <Button
                  variant='outline'
                  onClick={() =>
                    setSettings(manifest.id, {
                      ...current,
                      customTheme: DEFAULT_CUSTOM_THEME,
                    })
                  }
                  type='button'>
                  {t("plugins.themes.clear")}
                </Button>
                {current.editingThemeId ? (
                  <>
                    <Button
                      onClick={() => saveEditingUserTheme()}
                      type='button'
                      variant='default'>
                      {t("plugins.themes.save")}
                    </Button>
                    <Button
                      onClick={() => cancelEditingUserTheme()}
                      type='button'
                      variant='outline'>
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
