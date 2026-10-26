import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";
import { ThemeProvider } from "@/components/providers/theme";
import { PreviewSurface } from "@/components/skins/skin-preview-panel";
import { useSkinModelPreview } from "@/hooks/use-skin-model-preview";
import { usePersistedStore } from "@/lib/store";

export const DebugViewer = () => {
  const { modId } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const mod = usePersistedStore((state) =>
    state.localMods.find((item) => (item.remoteId ?? item.id) === modId),
  );
  const hero = params.get("hero") ?? mod?.hero ?? "Abrams";
  const preview = useSkinModelPreview(
    hero,
    mod ?? null,
    !modId || Boolean(mod),
  );
  const label = mod?.name ?? t("skins.preview.defaultLabel", { hero });
  return (
    <ThemeProvider>
      <main className='flex h-dvh flex-col bg-background p-3 text-foreground'>
        <header className='mb-3 flex shrink-0 items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h1 className='truncate font-semibold text-sm'>{label}</h1>
            <p className='text-xs text-muted-foreground'>
              {t("modelPreview.debugHint")}
            </p>
          </div>
          <Button asChild size='sm' variant='outline'>
            <Link to={mod ? `/mods/${mod.remoteId ?? mod.id}` : "/skins"}>
              {t("modelPreview.backToMod")}
            </Link>
          </Button>
        </header>
        {modId && !mod ? (
          <p role='alert'>{t("modelPreview.localModMissing")}</p>
        ) : (
          <div className='relative min-h-0 flex-1'>
            <PreviewSurface
              key={`${modId}:${hero}`}
              preview={preview}
              label={label}
            />
          </div>
        )}
      </main>
    </ThemeProvider>
  );
};
