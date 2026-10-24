import { Button } from "@deadlock-mods/ui/components/button";
import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deadlock-mods/ui/components/popover";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Slider } from "@deadlock-mods/ui/components/slider";
import { Switch } from "@deadlock-mods/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  ApertureIcon,
  ArrowCounterClockwiseIcon,
  CameraIcon,
  CaretDownIcon,
  CheckIcon,
  CornersInIcon,
  CornersOutIcon,
  CubeTransparentIcon,
  FrameCornersIcon,
  ImageIcon,
  type Icon,
  PenNibIcon,
  PlanetIcon,
  SlidersHorizontalIcon,
  StairsIcon,
  StopIcon,
  SunHorizonIcon,
  VideoCameraIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  loadViewerBackground,
  type ViewerBackground,
} from "./viewer-background";
import { RECORDING_LIMIT_MS } from "./viewer-capture";

export interface ViewerLook {
  bloom: boolean;
  outlines: boolean;
  antialias: boolean;
  wireframe: boolean;
  exposure: number;
}

export const DEFAULT_LOOK: ViewerLook = {
  bloom: false,
  outlines: false,
  antialias: true,
  wireframe: false,
  exposure: 0.95,
};

/** A View menu switch for something drawn over the model, such as the ability bar. */
export interface ViewerOverlayToggle {
  id: string;
  label: string;
  icon: Icon;
  shortcut?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Controls float over the render, so they need their own backdrop to stay legible on any background image. */
export const overlaySurface =
  "border border-white/10 bg-background/80 shadow-black/40 shadow-lg backdrop-blur-sm";

const EASE_OUT_QUART = "cubic-bezier(0.25, 1, 0.5, 1)";

const SwitchRow = ({
  icon: RowIcon,
  label,
  shortcut,
  checked,
  onCheckedChange,
}: Omit<ViewerOverlayToggle, "id">) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className='flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-xs transition-colors hover:bg-muted/60'>
      <RowIcon className='size-3.5 shrink-0 text-muted-foreground' />
      <span className='flex-1'>{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className='h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3'
      />
    </label>
  );
};

const MenuSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <div className='py-1'>
    <p className='px-2 pt-1 pb-1.5 font-medium text-[11px] text-muted-foreground'>
      {title}
    </p>
    {children}
  </div>
);

export const ViewerViewMenu = ({
  look,
  onChange,
  overlays,
}: {
  look: ViewerLook;
  onChange: (look: ViewerLook) => void;
  overlays: ViewerOverlayToggle[];
}) => {
  const { t } = useTranslation();
  const passes: {
    key: "bloom" | "outlines" | "antialias" | "wireframe";
    icon: Icon;
  }[] = [
    { key: "bloom", icon: SunHorizonIcon },
    { key: "outlines", icon: PenNibIcon },
    { key: "antialias", icon: StairsIcon },
    { key: "wireframe", icon: CubeTransparentIcon },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size='sm'
          variant='ghost'
          className={cn(
            overlaySurface,
            "group h-8 gap-1.5 px-2.5 text-xs data-[state=open]:border-primary/40",
          )}>
          <SlidersHorizontalIcon className='size-3.5' />
          {t("modelPreview.view")}
          <CaretDownIcon className='size-3 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' sideOffset={6} className='w-72 p-1.5'>
        <MenuSection title={t("modelPreview.renderSettings")}>
          {passes.map(({ key, icon }) => (
            <SwitchRow
              key={key}
              icon={icon}
              label={t(`modelPreview.${key}`)}
              checked={look[key]}
              onCheckedChange={(checked) =>
                onChange({ ...look, [key]: checked })
              }
            />
          ))}
          <div className='space-y-2.5 px-2 pt-2 pb-2.5'>
            <div className='flex items-center gap-2.5 text-xs'>
              <ApertureIcon className='size-3.5 text-muted-foreground' />
              <span className='flex-1'>{t("modelPreview.exposure")}</span>
              <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
                {look.exposure.toFixed(2)}
              </span>
            </div>
            <Slider
              aria-label={t("modelPreview.exposure")}
              min={0.25}
              max={2}
              step={0.05}
              value={[look.exposure]}
              onValueChange={([exposure]) =>
                exposure !== undefined && onChange({ ...look, exposure })
              }
            />
          </div>
        </MenuSection>
        {overlays.length > 0 && (
          <>
            <Separator />
            <MenuSection title={t("modelPreview.overlays")}>
              {overlays.map(({ id, ...overlay }) => (
                <SwitchRow key={id} {...overlay} />
              ))}
            </MenuSection>
          </>
        )}
        <Separator />
        <button
          type='button'
          className='mt-1 flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
          disabled={(Object.keys(DEFAULT_LOOK) as (keyof ViewerLook)[]).every(
            (key) => look[key] === DEFAULT_LOOK[key],
          )}
          onClick={() => onChange(DEFAULT_LOOK)}>
          <ArrowCounterClockwiseIcon className='size-3.5' />
          {t("modelPreview.resetView")}
        </button>
      </PopoverContent>
    </Popover>
  );
};

export const ViewerBackgroundButton = ({
  background,
  onBackgroundChange,
}: {
  background: ViewerBackground | null;
  onBackgroundChange: (background: ViewerBackground | null) => void;
}) => {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: loadViewerBackground,
    onSuccess: onBackgroundChange,
    meta: { skipGlobalErrorHandler: true },
  });
  return (
    <div className='flex flex-col items-start gap-1.5'>
      <div className={cn(overlaySurface, "flex h-8 items-center rounded-md")}>
        <input
          ref={fileInput}
          type='file'
          accept='image/png,image/jpeg,image/webp'
          className='sr-only'
          tabIndex={-1}
          aria-label={t("modelPreview.chooseBackground")}
          disabled={upload.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }}
        />
        <Button
          size='sm'
          variant='ghost'
          className='h-full max-w-44 gap-1.5 px-2.5 text-xs'
          title={background?.name ?? t("modelPreview.chooseBackground")}
          isLoading={upload.isPending}
          onClick={() => fileInput.current?.click()}>
          <ImageIcon className='size-3.5' />
          <span className='truncate'>
            {background?.name ?? t("modelPreview.backgroundImage")}
          </span>
        </Button>
        {background && (
          <Button
            size='icon'
            variant='ghost'
            className='h-full w-7 rounded-l-none border-white/10 border-l'
            aria-label={t("modelPreview.clearBackground")}
            title={t("modelPreview.clearBackground")}
            disabled={upload.isPending}
            onClick={() => {
              upload.reset();
              onBackgroundChange(null);
            }}>
            <XIcon className='size-3' />
          </Button>
        )}
      </div>
      {upload.isError && (
        <p
          role='alert'
          className={cn(
            overlaySurface,
            "max-w-64 rounded-md px-2.5 py-1.5 text-destructive text-xs",
          )}>
          {t("modelPreview.backgroundFailed")}
        </p>
      )}
    </div>
  );
};

const RailButton = ({
  label,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size='icon'
        variant='ghost'
        aria-label={label}
        className={cn(
          "size-8 text-muted-foreground hover:text-foreground",
          className,
        )}
        {...props}
      />
    </TooltipTrigger>
    <TooltipContent side='left'>{label}</TooltipContent>
  </Tooltip>
);

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
          <PlanetIcon
            className='size-4'
            weight={autoRotate ? "fill" : "regular"}
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
