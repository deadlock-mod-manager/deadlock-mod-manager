"use client";

import { EyedropperIcon } from "@phosphor-icons/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { cn } from "@deadlock-mods/ui/lib/utils";

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };

const HEX_PATTERN = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const isValidHex = (hex: string): boolean => HEX_PATTERN.test(hex);

/** Expand `#rgb` to `#rrggbb` and lowercase it, falling back when invalid. */
export const normalizeHex = (hex: string, fallbackHex: string): string => {
  const raw = isValidHex(hex)
    ? hex
    : isValidHex(fallbackHex)
      ? fallbackHex
      : "#000000";
  const clean = raw.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : clean;
  return `#${full.toLowerCase()}`;
};

export const hexToRgb = (hex: string): Rgb | null => {
  const clean = hex.replace("#", "");
  if (
    !/^[0-9A-Fa-f]+$/.test(clean) ||
    (clean.length !== 3 && clean.length !== 6)
  ) {
    return null;
  }
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
};

const hexChannel = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

export const rgbToHex = (r: number, g: number, b: number): string =>
  `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`.toLowerCase();

export const rgbToHsv = (r: number, g: number, b: number): Hsv => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
    } else if (max === green) {
      hue = ((blue - red) / delta + 2) * 60;
    } else {
      hue = ((red - green) / delta + 4) * 60;
    }
  }
  return {
    h: Math.round(hue),
    s: Math.round(max === 0 ? 0 : (delta / max) * 100),
    v: Math.round(max * 100),
  };
};

export const hsvToRgb = (h: number, s: number, v: number): Rgb => {
  const saturation = s / 100;
  const value = v / 100;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = value - chroma;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = (
    [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ] as const
  )[sector];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
};

type ColorState = Hsv & Rgb;

const fromRgb = (r: number, g: number, b: number): ColorState => ({
  ...rgbToHsv(r, g, b),
  r,
  g,
  b,
});

const fromHsv = (h: number, s: number, v: number): ColorState => ({
  h,
  s,
  v,
  ...hsvToRgb(h, s, v),
});

const channelFromInput = (raw: string, previous: number): number => {
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? previous : Math.max(0, Math.min(255, parsed));
};

/** The browser's native eyedropper, when the platform webview exposes it. */
type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => { open: () => Promise<EyeDropperResult> };

const eyeDropperConstructor = (): EyeDropperCtor | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

/** Clamp a pointer position to a box and return it as a 0..1 fraction. */
const fraction = (value: number, start: number, length: number): number =>
  length <= 0 ? 0 : Math.min(1, Math.max(0, (value - start) / length));

/** Feed pointer positions to `onMove` until the button is released. */
const trackDrag = (
  onMove: (clientX: number, clientY: number) => void,
  event: MouseEvent,
) => {
  const move = (moved: MouseEvent) => onMove(moved.clientX, moved.clientY);
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  onMove(event.clientX, event.clientY);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
};

export interface ColorPickerProps {
  /** The current color, as `#rrggbb`. */
  value: string;
  onChange: (hex: string) => void;
  /** Used when `value` is not a valid hex color. */
  fallbackHex?: string;
  /** Hidden when false, e.g. on a platform without the native eyedropper. */
  showEyedropper?: boolean;
  labels?: {
    red?: string;
    green?: string;
    blue?: string;
    eyedropper?: string;
  };
  className?: string;
}

/**
 * An inline HSV color picker: a saturation/value field, a hue strip, RGB inputs
 * and the platform eyedropper. Emits `#rrggbb` on every change, so a caller can
 * drive a live preview from it directly.
 */
export const ColorPicker = ({
  value,
  onChange,
  fallbackHex = "#ffffff",
  showEyedropper = true,
  labels,
  className,
}: ColorPickerProps) => {
  const [color, setColor] = useState<ColorState>(() => fromHsv(0, 100, 100));
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const { h, s, v, r, g, b } = color;

  // Follow the controlled value, but ignore the echo of our own emit: comparing
  // hex keeps a drag from resetting the picker on every frame.
  const currentHex = useMemo(() => rgbToHex(r, g, b), [r, g, b]);
  useEffect(() => {
    const normalized = normalizeHex(value, fallbackHex);
    if (normalized === currentHex) {
      return;
    }
    const rgb = hexToRgb(normalized);
    if (rgb) {
      setColor(fromRgb(rgb.r, rgb.g, rgb.b));
    }
    // currentHex is deliberately not a dependency: this effect only reacts to
    // the value handed in from outside.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [value, fallbackHex]);

  const emit = useCallback(
    (next: ColorState) => {
      setColor(next);
      onChange(rgbToHex(next.r, next.g, next.b));
    },
    [onChange],
  );

  const hueColor = useMemo(() => {
    const { r: hr, g: hg, b: hb } = hsvToRgb(h, 100, 100);
    return `rgb(${hr}, ${hg}, ${hb})`;
  }, [h]);

  const pickSaturationValue =
    (rect: DOMRect) => (clientX: number, clientY: number) => {
      emit(
        fromHsv(
          h,
          Math.round(fraction(clientX, rect.left, rect.width) * 100),
          Math.round(100 - fraction(clientY, rect.top, rect.height) * 100),
        ),
      );
    };

  const pickHue = (rect: DOMRect) => (clientX: number, _clientY: number) => {
    emit(
      fromHsv(Math.round(fraction(clientX, rect.left, rect.width) * 360), s, v),
    );
  };

  const pickWithEyedropper = async (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const EyeDropper = eyeDropperConstructor();
    if (!EyeDropper) return;
    try {
      setEyedropperActive(true);
      const picked = await new EyeDropper().open();
      const rgb = picked?.sRGBHex ? hexToRgb(picked.sRGBHex) : null;
      if (rgb) {
        emit(fromRgb(rgb.r, rgb.g, rgb.b));
      }
    } catch {
      // The user dismissed the eyedropper; nothing to report.
    } finally {
      setEyedropperActive(false);
    }
  };

  const channels: Array<[string, number, (next: number) => ColorState]> = [
    [labels?.red ?? "R", r, (next) => fromRgb(next, g, b)],
    [labels?.green ?? "G", g, (next) => fromRgb(r, next, b)],
    [labels?.blue ?? "B", b, (next) => fromRgb(r, g, next)],
  ];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/** biome-ignore lint/a11y/noStaticElementInteractions: the RGB inputs below are the keyboard path */}
      <div
        className='relative h-32 w-full cursor-crosshair rounded-md border'
        onMouseDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          trackDrag(pickSaturationValue(rect), event.nativeEvent);
        }}
        style={{
          background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, ${hueColor})`,
        }}>
        <div
          className='-mt-1.5 -ml-1.5 pointer-events-none absolute h-3 w-3 rounded-full border-2 border-white shadow'
          style={{ left: `${s}%`, top: `${100 - v}%` }}
        />
      </div>

      {/** biome-ignore lint/a11y/noStaticElementInteractions: the RGB inputs below are the keyboard path */}
      <div
        className='relative h-3 w-full cursor-pointer rounded-md border'
        onMouseDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          trackDrag(pickHue(rect), event.nativeEvent);
        }}
        style={{
          background:
            "linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
        }}>
        <div
          className='-translate-y-1/2 -ml-2 pointer-events-none absolute top-1/2 h-4 w-4 rounded-full border-2 border-white shadow'
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>

      <div className='flex items-center gap-2'>
        <div
          className='h-7 w-7 shrink-0 rounded border'
          style={{ backgroundColor: currentHex }}
        />
        <span className='flex-1 font-mono text-muted-foreground text-xs uppercase'>
          {currentHex}
        </span>
        {showEyedropper && eyeDropperConstructor() && (
          <Button
            aria-label={labels?.eyedropper ?? "Pick a color from the screen"}
            className='h-7 w-7'
            disabled={eyedropperActive}
            onClick={pickWithEyedropper}
            size='icon'
            type='button'
            variant='outline'>
            <EyedropperIcon className='h-4 w-4' />
          </Button>
        )}
      </div>

      <div className='grid grid-cols-3 gap-2'>
        {channels.map(([label, channelValue, next]) => (
          <div key={label}>
            <Label className='mb-1 block text-muted-foreground text-xs'>
              {label}
            </Label>
            <Input
              className='h-7 text-xs'
              inputMode='numeric'
              onChange={(event) =>
                emit(next(channelFromInput(event.target.value, channelValue)))
              }
              value={channelValue}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
