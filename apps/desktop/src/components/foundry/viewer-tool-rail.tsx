import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ArrowClockwiseIcon,
  CameraIcon,
  CheckIcon,
  CornersInIcon,
  CornersOutIcon,
  FrameCornersIcon,
  StopIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { RECORDING_LIMIT_MS } from "./viewer-capture";
import { EASE_OUT_QUART, overlaySurface } from "./viewer-tool-types";
import { RailButton } from "./viewer-rail-button";

const formatSeconds = (ms: number) =>
  `0:${String(Math.floor(ms / 1000)).padStart(2, "0")}`;

/** Camera and capture controls down the right edge of the viewport, plus the shutter flash and the recording badge they drive. */
export const ViewerToolRail = ({
  belowGizmo,
  autoRotate,
  onAutoRotateChange,
  onFit,
  capture,
  record,
  stopRecording,
  fullscreen,
}: {
  belowGizmo: boolean;
  autoRotate: boolean;
  onAutoRotateChange: (on: boolean) => void;
  onFit: () => void;
  capture: () => Promise<Blob | null>;
  record: () => Promise<Blob>;
  stopRecording: () => void;
  fullscreen: () => Promise<void>;
}) => {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const flashRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(
    () => document.fullscreenElement !== null,
  );
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);
  const screenshot = useMutation({
    mutationFn: async () => {
      const blob = await capture();
      if (!blob) return false;
      if (!reducedMotion)
        flashRef.current?.animate([{ opacity: 0.55 }, { opacity: 0 }], {
          duration: 450,
          easing: EASE_OUT_QUART,
        });
      const path = await save({
        defaultPath: "mod-preview.png",
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return false;
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      return true;
    },
    onSuccess: setSaved,
    meta: { skipGlobalErrorHandler: true },
  });
  const video = useMutation({
    mutationFn: async () => {
      const blob = await record();
      const path = await save({
        defaultPath: "mod-preview.webm",
        filters: [{ name: "WebM", extensions: ["webm"] }],
      });
      if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    },
    meta: { skipGlobalErrorHandler: true },
  });
  const recording = video.isPending;
  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    setRecordedMs(0);
    const timer = window.setInterval(
      () =>
        setRecordedMs(
          Math.min(performance.now() - started, RECORDING_LIMIT_MS),
        ),
      250,
    );
    return () => window.clearInterval(timer);
  }, [recording]);
  const canRecord =
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";
  const expand = useMutation({
    mutationFn: fullscreen,
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <>
      <div
        ref={flashRef}
        aria-hidden
        className='pointer-events-none absolute inset-0 bg-[oklch(0.97_0.02_90)] opacity-0'
      />
      {recording && (
        <button
          type='button'
          onClick={stopRecording}
          aria-label={t("modelPreview.stopRecording")}
          className={cn(
            overlaySurface,
            "-translate-x-1/2 absolute top-3 left-1/2 flex h-8 items-center gap-2 rounded-full pr-2.5 pl-3 text-xs transition-colors hover:border-red-400/40",
          )}>
          <span className='size-2 rounded-full bg-red-500 motion-safe:animate-pulse' />
          <span className='font-semibold text-red-400 tracking-wide'>
            {t("modelPreview.recordingBadge")}
          </span>
          <span className='font-mono text-[11px] tabular-nums'>
            {formatSeconds(recordedMs)}
            <span className='text-muted-foreground'>
              {" / "}
              {formatSeconds(RECORDING_LIMIT_MS)}
            </span>
          </span>
          <StopIcon weight='fill' className='size-3 text-muted-foreground' />
        </button>
      )}
      <div
        role='toolbar'
        aria-orientation='vertical'
        aria-label={t("modelPreview.viewerTools")}
        className={cn(
          overlaySurface,
          "absolute right-3 flex flex-col gap-0.5 rounded-lg p-1",
          belowGizmo ? "top-[100px]" : "top-3",
        )}>
        <RailButton label={t("modelPreview.fitCamera")} onClick={onFit}>
          <FrameCornersIcon className='size-4' />
        </RailButton>
        <RailButton
          label={t(
            autoRotate
              ? "foundry.preview.stopSpin"
              : "foundry.preview.startSpin",
          )}
          aria-pressed={autoRotate}
          className={cn(autoRotate && "text-primary hover:text-primary")}
          onClick={() => onAutoRotateChange(!autoRotate)}>
          <ArrowClockwiseIcon
            className={cn(
              "size-4",
              autoRotate && "motion-safe:animate-[spin_3s_linear_infinite]",
            )}
            weight='bold'
          />
        </RailButton>
        <div className='mx-1.5 my-0.5 h-px bg-white/10' />
        <RailButton
          label={t(
            saved ? "modelPreview.screenshotSaved" : "modelPreview.screenshot",
          )}
          disabled={screenshot.isPending}
          className={cn(saved && "text-primary hover:text-primary")}
          onClick={() => screenshot.mutate()}>
          {saved ? (
            <CheckIcon
              className='size-4 motion-safe:animate-in motion-safe:zoom-in-50'
              weight='bold'
            />
          ) : (
            <CameraIcon className='size-4' />
          )}
        </RailButton>
        {canRecord && (
          <RailButton
            label={t(
              recording
                ? "modelPreview.stopRecording"
                : "modelPreview.recordVideo",
            )}
            aria-pressed={recording}
            className={cn(recording && "text-red-400 hover:text-red-400")}
            onClick={() => (recording ? stopRecording() : video.mutate())}>
            {recording ? (
              <StopIcon className='size-4' weight='fill' />
            ) : (
              <VideoCameraIcon className='size-4' />
            )}
          </RailButton>
        )}
        <RailButton
          label={t(
            isFullscreen
              ? "modelPreview.exitFullscreen"
              : "modelPreview.fullscreen",
          )}
          disabled={expand.isPending}
          onClick={() => expand.mutate()}>
          {isFullscreen ? (
            <CornersInIcon className='size-4' />
          ) : (
            <CornersOutIcon className='size-4' />
          )}
        </RailButton>
      </div>
      {(screenshot.isError || video.isError || expand.isError) && (
        <p
          role='alert'
          className={cn(
            overlaySurface,
            "absolute right-14 max-w-48 rounded-md px-2.5 py-1.5 text-destructive text-xs",
            belowGizmo ? "top-[100px]" : "top-3",
          )}>
          {t("modelPreview.toolFailed")}
        </p>
      )}
    </>
  );
};
