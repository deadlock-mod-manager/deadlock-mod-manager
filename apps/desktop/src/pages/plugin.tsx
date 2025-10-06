import { Button } from "@deadlock-mods/ui/components/button";
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
    (async () => {
      if (!plugin?.entryImporter) {
        return;
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
        logger.error("Error loading module", { pluginId: id, error: e });
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
    <div className='flex h-[calc(100vh-160px)] w-full'>
      <div className='flex w-full flex-col gap-4'>
        <div className='flex items-center justify-between px-4'>
          <PageTitle title={t(plugin.manifest.nameKey)} />
          <div className='flex items-center gap-2'>
            <Button
              onClick={() => setEnabled(id!, !isEnabled)}
              size='default'
              variant={isEnabled ? "default" : "outline"}>
              {isEnabled ? t("common.disable") : t("common.enable")}
            </Button>
            <Button
              onClick={() => navigate(-1)}
              size='default'
              variant='outline'>
              {t("common.back")}
            </Button>
          </div>
        </div>

        <div className='px-4'>
          <p className='text-muted-foreground text-sm'>
            {t(plugin.manifest.descriptionKey)}
          </p>
        </div>

        {module?.Settings && (
          <div className='px-4'>
            <Section
              title={t("common.settings")}
              description={t("plugins.background.description")}>
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
