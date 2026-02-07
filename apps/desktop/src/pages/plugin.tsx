import { Button } from "@deadlock-mods/ui/components/button";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import Section from "@/components/settings/section";
import ErrorBoundary from "@/components/shared/error-boundary";
import PageTitle from "@/components/shared/page-title";
import logger from "@/lib/logger";
import { getPlugins } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

const PluginEntry = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [module, setModule] = useState<PluginModule | null>(null);

  const plugin = useMemo(
    () => getPlugins().find((p) => p.manifest.id === id),
    [id],
  );
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[id ?? ""] ?? false,
  );
  const setEnabled = usePersistedStore((s) => s.setEnabledPlugin);

  useEffect(() => {
    let cancelled = false;
    // Always clear prior module state when plugin changes or effect reruns
    setModule(null);
    (async () => {
      if (!plugin?.entryImporter) {
        return; // module already reset above so UI clears
      }

      try {
        const mod: unknown = await plugin.entryImporter();

        if (cancelled) {
          return;
        }

        // Attempt to resolve both ESM default export and direct export
        const record =
          typeof mod === "object" && mod
            ? (mod as Record<string, unknown>)
            : undefined;
        const maybeDefault = record?.default as unknown;
        const candidate =
          maybeDefault && typeof maybeDefault === "object"
            ? maybeDefault
            : record;
        const resolved =
          candidate && typeof candidate === "object" && "manifest" in candidate
            ? (candidate as PluginModule)
            : undefined;

        if (resolved && typeof resolved === "object") {
          setModule(resolved);
        }
      } catch (e) {
        logger
          .withMetadata({ pluginId: id })
          .withError(e instanceof Error ? e : new Error(String(e)))
          .error("Error loading module");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plugin, id]);

  if (!plugin) {
    return (
      <div className='flex h-[calc(100vh-160px)] w-full items-center justify-center'>
        <div className='text-muted-foreground'>{t("common.notFound")}</div>
      </div>
    );
  }

  return (
    <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin flex h-[calc(100vh-160px)] w-full overflow-y-auto'>
      <div className='flex w-full flex-col gap-4'>
        <div className='flex items-center justify-between px-4 pt-4 w-full'>
          <div className='flex items-start gap-2 flex-col py-8 w-full'>
            <Button
              className='flex items-center gap-1 my-2'
              onClick={() =>
                navigate("/settings", { state: { activeTab: "plugin" } })
              }
              variant='transparent'
              size='text'>
              <ArrowLeft className='h-4 w-4' />
              {t("common.back")}
            </Button>
            <div className='flex items-center gap-2 justify-between w-full'>
              <PageTitle
                title={t(plugin.manifest.nameKey)}
                subtitle={t(plugin.manifest.descriptionKey)}
              />{" "}
              <div className='flex items-center gap-2'>
                <span className='text-sm text-muted-foreground'>
                  {isEnabled ? t("common.enabled") : t("common.disabled")}
                </span>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => {
                    if (!id) return;
                    setEnabled(id, checked);
                  }}
                  disabled={!id}
                  className='data-[state=checked]:bg-primary'
                />
              </div>
            </div>
          </div>
        </div>

        {module?.Settings && (
          <div className='px-4'>
            <Section
              title={t("common.settings")}
              description={t(
                `plugins.${plugin.manifest.id}.settingsDescription`,
                {
                  defaultValue: t(plugin.manifest.descriptionKey),
                },
              )}>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className='text-muted-foreground text-sm'>
                      {t("common.loading")}
                    </div>
                  }>
                  <module.Settings />
                </Suspense>
              </ErrorBoundary>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginEntry;
