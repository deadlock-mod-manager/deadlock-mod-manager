import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PlugIcon,
  TagIcon,
  UserIcon,
} from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { getPlugins } from "@/lib/plugins";
import type { LoadedPlugin } from "@/types/plugins";

export const PluginList = () => {
  const { t } = useTranslation();
  const plugins = getPlugins();
  const navigate = useNavigate();
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(
    new Set(),
  );

  if (plugins.length === 0) {
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
    <div className='max-h-[50vh] overflow-y-auto rounded-md border'>
      <ul className='divide-y'>
        {plugins.map((p: LoadedPlugin) => {
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
                      className='h-12 w-12'
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
                    {/* Detailed Description */}
                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      {t(`plugins.${p.manifest.id}.detailedDescription`)}
                    </div>

                    {/* Usage Instructions */}
                    <div className='text-sm text-muted-foreground leading-relaxed'>
                      <strong className='text-foreground'>
                        {t("plugins.usageInstructions", "Usage Instructions")}:
                      </strong>
                      <br />
                      {t(`plugins.${p.manifest.id}.usageInstructions`)}
                    </div>

                    {/* Plugin Details */}
                    <div className='flex flex-col gap-2 pt-2 border-t border-border/50'>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <TagIcon className='h-4 w-4' />
                        <span>v{p.manifest.version}</span>
                      </div>
                      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                        <UserIcon className='h-4 w-4' />
                        <span>{p.manifest.author}</span>
                      </div>
                      {p.manifest.homepageUrl && (
                        <div className='flex items-center gap-2 text-sm'>
                          <ExternalLinkIcon className='h-4 w-4 text-muted-foreground' />
                          <a
                            className='text-primary hover:underline'
                            href={p.manifest.homepageUrl}
                            target='_blank'
                            rel='noreferrer'
                            onClick={(e) => e.stopPropagation()}>
                            Homepage
                          </a>
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
