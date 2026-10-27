import { Button } from "@deadlock-mods/ui/components/button";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useSourceParticles,
  type ParticleDraftSources,
} from "@/hooks/use-source-particles";
import type { PreviewSource } from "@/lib/preview-animation";
import { PreviewStage } from "./preview-stage";

const NO_EXTRA_ROOTS: string[] = [];

export function ParticlePreview({
  source,
  drafts,
  picking = false,
  onColorPicked,
  onCancelPick,
  onPickError,
  onSnapshot,
}: {
  source: PreviewSource;
  drafts?: ParticleDraftSources;
  picking?: boolean;
  onColorPicked?: (hex: string) => void;
  onCancelPick?: () => void;
  onPickError?: () => void;
  onSnapshot?: (image: string | null) => void;
}) {
  const { t } = useTranslation();
  const { graph, models } = useSourceParticles(
    source,
    null,
    NO_EXTRA_ROOTS,
    drafts,
    onSnapshot ? 256 : 1024,
  );
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<PreviewStage | null>(null);
  const callbacks = useRef({
    onColorPicked,
    onCancelPick,
    onPickError,
    onSnapshot,
  });
  callbacks.current = { onColorPicked, onCancelPick, onPickError, onSnapshot };
  const [playing, setPlaying] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const thumbnail = !!onSnapshot;
  useEffect(() => {
    if (!host.current) return;
    const preview = new PreviewStage(host.current, thumbnail);
    preview.callbacks = {
      snapshot: (image) => callbacks.current.onSnapshot?.(image),
      warnings: setWarnings,
    };
    stage.current = preview;
    return () => {
      stage.current = null;
      preview.dispose();
    };
  }, [thumbnail]);
  useEffect(() => {
    stage.current?.renderer.domElement.setAttribute(
      "aria-label",
      t("workbenchExplorer.particleCanvas"),
    );
  }, [t, thumbnail]);
  useEffect(() => {
    if (graph.data) stage.current?.setGraph(graph.data, models);
  }, [graph.data, models, thumbnail]);
  useEffect(() => {
    stage.current?.setPlaying(playing);
  }, [playing, thumbnail]);
  useEffect(() => {
    if (graph.error) callbacks.current.onSnapshot?.(null);
  }, [graph.error]);
  useEffect(() => {
    if (!picking) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacks.current.onCancelPick?.();
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [picking]);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div
        ref={host}
        onPointerDownCapture={(event) => {
          if (!picking) return;
          event.preventDefault();
          event.stopPropagation();
          try {
            const hex = stage.current?.colorAt(event.clientX, event.clientY);
            if (hex) onColorPicked?.(hex);
            else onPickError?.();
          } catch {
            onPickError?.();
          }
        }}
        className={`relative min-h-0 flex-1 overflow-hidden bg-muted/20 ${picking ? "cursor-crosshair ring-1 ring-inset ring-primary" : ""}`}>
        {!graph.data ? (
          <p
            role={graph.error ? "alert" : "status"}
            className='absolute inset-0 z-10 p-4 text-sm text-muted-foreground'>
            {graph.error?.message ?? t("common.loading")}
          </p>
        ) : null}
      </div>
      {!thumbnail ? (
        <>
          <div className='flex gap-2 border-t p-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setPlaying(!playing)}>
              {t(playing ? "modelPreview.pause" : "modelPreview.play")}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={() => stage.current?.restart()}>
              {t("modelPreview.restart")}
            </Button>
          </div>
          <p className='px-2 pb-2 text-xs text-muted-foreground'>
            {t("workbenchExplorer.particlePreviewHint")}
          </p>
          {warnings.length ? (
            <details className='max-h-32 overflow-auto border-t p-2 text-xs text-muted-foreground'>
              <summary>{t("modelPreview.effectsLimited")}</summary>
              {warnings.map((warning) => (
                <p key={warning} className='break-words pt-1'>
                  {warning}
                </p>
              ))}
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
