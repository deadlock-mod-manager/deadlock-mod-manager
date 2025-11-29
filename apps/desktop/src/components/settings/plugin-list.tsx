import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PlugIcon,
  TagIcon,
  UserIcon,
} from "@deadlock-mods/ui/icons";
import { open } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { getPlugins } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { LoadedPlugin } from "@/types/plugins";

export const PluginList = () => {
  const { t } = useTranslation();
  const plugins = getPlugins();
  const navigate = useNavigate();
  const { togglePlugin, isPluginEnabled } = usePersistedStore();
  const { data: featureFlags } = useFeatureFlags();
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(
    new Set(),
  );

  // Create a map of feature flags for quick lookup
  const featureFlagMap = new Map<string, boolean>();
  if (featureFlags && Array.isArray(featureFlags)) {
    for (const flag of featureFlags) {
      featureFlagMap.set(flag.name, flag.enabled as boolean);
    }
  }

  // Since plugins are already filtered by feature flags, we only need to check local configuration
  const isPluginEnabledLocally = (pluginId: string) => {
    return isPluginEnabled(pluginId);
  };

  // Filter plugins based on feature flags
  const visiblePlugins = plugins.filter((plugin) => {
    const flagName = `plugin-${plugin.manifest.id}`;
    const flagEnabled = featureFlagMap.get(flagName) ?? true;
    return flagEnabled;
  });

  if (visiblePlugins.length === 0) {
    return (
      <div className='text-muted-foreground text-sm'>
        {t("common.none") ?? ""}
      </div>
    );
  }

  const toggleExpanded = (pluginId: string) => {
    setExpandedPlugins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pluginId)) {
        newSet.delete(pluginId);
      } else {
        newSet.add(pluginId);
      }
      return newSet;
    });
  };

  return (
    <div className='rounded-md border'>
      <ul className='divide-y'>
        {visiblePlugins.map((p: LoadedPlugin) => {
          const isExpanded = expandedPlugins.has(p.manifest.id);
          return (
            <li key={p.manifest.id}>
              <div
                className='flex items-center gap-4 p-3 cursor-pointer hover:bg-accent/50 transition-colors'
                onClick={() => toggleExpanded(p.manifest.id)}>
                <div className='flex items-center gap-2'>
                  {isExpanded ? (
                    <ChevronDownIcon className='h-4 w-4 text-muted-foreground' />
                  ) : (
                    <ChevronRightIcon className='h-4 w-4 text-muted-foreground' />
                  )}
                  {p.iconUrl ? (
                    <img
                      alt={p.manifest.id}
                      className='h-12 w-12 '
                      src={p.iconUrl}
                    />
                  ) : (
                    <PlugIcon className='h-12 w-12 text-muted-foreground' />
                  )}
                </div>
                <div className='flex min-w-0 flex-1 flex-col'>
                  <div className='flex items-center gap-2'>
                    <span className='truncate font-medium'>
                      {t(p.manifest.nameKey)}
                    </span>
                    {p.manifest.tags?.includes("official") && (
                      <span className='rounded bg-primary/10 px-2 py-0.5 text-primary text-xs'>
                        official
                      </span>
                    )}
                  </div>
                  <span className='text-muted-foreground truncate text-sm mt-0.5'>
                    {t(p.manifest.descriptionKey)}
                  </span>
                </div>
                <div className='ml-4 flex items-center gap-2 flex-shrink-0'>
                  <Switch
                    checked={isPluginEnabledLocally(p.manifest.id)}
                    onCheckedChange={() => {
                      togglePlugin(p.manifest.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className='data-[state=checked]:bg-primary'
                  />
                  <button
                    className='inline-flex items-center gap-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50'
                    disabled={!p.entryImporter}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/plugins/${p.manifest.id}`);
                    }}
                    type='button'>
                    {t("common.open")}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className='px-3 pb-3 border-t bg-muted/20'>
                  <div className='flex flex-col gap-3 mt-3 ml-6'>
                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      {t(`plugins.${p.manifest.id}.detailedDescription`)}
                    </div>

                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      <strong className='text-foreground'>
                        {t("plugins.usageInstructions", "Usage Instructions")}:
                      </strong>
                      <br />
                      {t(`plugins.${p.manifest.id}.usageInstructions`)}
                    </div>

                    <div className='flex flex-col gap-2 pt-2 border-t border-border/50'>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <TagIcon className='h-4 w-4' />
                        <span>v{p.manifest.version}</span>
                      </div>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <UserIcon className='h-4 w-4' />
                        {Array.isArray(p.manifest.author) ? (
                          <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                            {p.manifest.author.map((name, idx) => {
                              const url = Array.isArray(p.manifest.authorUrl)
                                ? p.manifest.authorUrl[idx]
                                : typeof p.manifest.authorUrl === "string"
                                  ? p.manifest.authorUrl
                                  : undefined;
                              return url ? (
                                <button
                                  key={name}
                                  className='text-primary hover:underline'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void open(url);
                                  }}
                                  type='button'>
                                  {name}
                                </button>
                              ) : (
                                <span key={name}>{name}</span>
                              );
                            })}
                          </span>
                        ) : p.manifest.authorUrl ? (
                          <button
                            className='text-primary hover:underline'
                            onClick={(e) => {
                              e.stopPropagation();
                              const url = Array.isArray(p.manifest.authorUrl)
                                ? p.manifest.authorUrl[0]
                                : p.manifest.authorUrl;
                              if (url) void open(url);
                            }}
                            type='button'>
                            {p.manifest.author}
                          </button>
                        ) : (
                          <span>{p.manifest.author}</span>
                        )}
                      </div>
                      {p.manifest.homepageUrl && (
                        <div className='flex items-center gap-2 text-sm'>
                          <ExternalLinkIcon className='h-4 w-4 text-muted-foreground' />
                          <button
                            className='text-primary hover:underline'
                            onClick={(e) => {
                              e.stopPropagation();
                              void open(p.manifest.homepageUrl!);
                            }}
                            type='button'>
                            Homepage
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
