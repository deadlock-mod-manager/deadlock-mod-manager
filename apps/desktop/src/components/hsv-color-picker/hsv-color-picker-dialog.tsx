import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Eyedropper } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  hexToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "./color-model";
import { getEyeDropperConstructor } from "./eye-dropper";

function rgbChannelFromInput(raw: string, previous: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return previous;
  }
  return Math.max(0, Math.min(255, parsed));
}

type ColorState = {
  h: number;
  s: number;
  v: number;
  r: number;
  g: number;
  b: number;
};

function createColorStateFromRgb(r: number, g: number, b: number): ColorState {
  const hsv = rgbToHsv(r, g, b);

  return {
    h: hsv.h,
    s: hsv.s,
    v: hsv.v,
    r,
    g,
    b,
  };
}

function createColorStateFromHsv(h: number, s: number, v: number): ColorState {
  const rgb = hsvToRgb(h, s, v);

  return {
    h,
    s,
    v,
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
  };
}

export type HsvColorPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colorHex: string;
  fallbackHex: string;
  title: string;
  description: string;
  onApply: (hex: string) => void;
  onEyedropperPick: (hex: string) => void;
};

export function HsvColorPickerDialog({
  open,
  onOpenChange,
  colorHex,
  fallbackHex,
  title,
  description,
  onApply,
  onEyedropperPick,
}: HsvColorPickerDialogProps) {
  const { t } = useTranslation();
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [colorState, setColorState] = useState<ColorState>(() =>
    createColorStateFromHsv(0, 100, 100),
  );
  const { h, s, v, r, g, b } = colorState;

  useEffect(() => {
    if (!open) {
      return;
    }
    const normalized = normalizeHex(colorHex, fallbackHex);
    const rgb = hexToRgb(normalized);
    if (rgb === null) {
      return;
    }
    setColorState(createColorStateFromRgb(rgb.r, rgb.g, rgb.b));
  }, [open, colorHex, fallbackHex]);

  const currentHex = useMemo(() => rgbToHex(r, g, b), [r, g, b]);
  const baseHueColor = useMemo(() => {
    const { r: rr, g: gg, b: bb } = hsvToRgb(h, 100, 100);
    return `rgb(${rr}, ${gg}, ${bb})`;
  }, [h]);

  const apply = () => {
    onApply(currentHex);
    onOpenChange(false);
  };

  const pickFromEyedropper = async (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const EyeDropperCtor = getEyeDropperConstructor();
    if (!EyeDropperCtor) {
      return;
    }
    try {
      setIsEyedropperActive(true);
      const eye = new EyeDropperCtor();
      const res = await eye.open();
      setIsEyedropperActive(false);
      if (res?.sRGBHex) {
        const hex = res.sRGBHex.toLowerCase();
        const rgb = hexToRgb(hex);
        if (rgb === null) {
          return;
        }
        setColorState(createColorStateFromRgb(rgb.r, rgb.g, rgb.b));
        onEyedropperPick(hex);
      }
    } catch {
      setIsEyedropperActive(false);
    }
  };

  const setSvFromClient = (rect: DOMRect, clientX: number, clientY: number) => {
    const x =
      clientX - rect.left < 0
        ? 0
        : clientX - rect.left > rect.width
          ? rect.width
          : clientX - rect.left;
    const y =
      clientY - rect.top < 0
        ? 0
        : clientY - rect.top > rect.height
          ? rect.height
          : clientY - rect.top;
    const sN = Math.round((x / rect.width) * 100);
    const vN = Math.round(100 - (y / rect.height) * 100);
    setColorState((current) => createColorStateFromHsv(current.h, sN, vN));
  };

  const setHueFromClient = (rect: DOMRect, clientX: number) => {
    const x =
      clientX - rect.left < 0
        ? 0
        : clientX - rect.left > rect.width
          ? rect.width
          : clientX - rect.left;
    setColorState((current) =>
      createColorStateFromHsv(
        Math.round((x / rect.width) * 360),
        current.s,
        current.v,
      ),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen && isEyedropperActive) {
          return;
        }
        onOpenChange(newOpen);
      }}>
      <DialogContent
        className='sm:max-w-[500px]'
        onPointerDownOutside={(e) => {
          if (isEyedropperActive) {
            e.preventDefault();
          }
        }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-4'>
          <div className='flex items-center gap-3'>
            <div
              className='h-8 w-12 rounded-full border'
              style={{ backgroundColor: currentHex }}
            />
            <Button
              type='button'
              variant='outline'
              onClick={pickFromEyedropper}
              className='gap-2'>
              <Eyedropper size={16} />
              {t("plugins.themes.eyedropper")}
            </Button>
          </div>

          <div className='flex flex-col gap-3'>
            <div
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const move = (ev: MouseEvent) => {
                  setSvFromClient(rect, ev.clientX, ev.clientY);
                };
                move(e.nativeEvent);
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
              onTouchStart={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                setSvFromClient(rect, touch.clientX, touch.clientY);
              }}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                setSvFromClient(rect, touch.clientX, touch.clientY);
              }}
              className='relative h-40 w-full rounded-md border'
              style={{
                background:
                  `linear-gradient(to top, black, transparent), ` +
                  `linear-gradient(to right, white, ${baseHueColor})`,
              }}>
              <div
                className='absolute h-3 w-3 -mt-1.5 -ml-1.5 rounded-full border-2 border-white shadow'
                style={{ left: `${s}%`, top: `${100 - v}%` }}
              />
            </div>

            <div
              className='h-3 w-full rounded-md border relative cursor-pointer'
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const move = (ev: MouseEvent) => {
                  setHueFromClient(rect, ev.clientX);
                };
                move(e.nativeEvent);
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
              onTouchStart={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                setHueFromClient(rect, touch.clientX);
              }}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                setHueFromClient(rect, touch.clientX);
              }}
              style={{
                background:
                  "linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
              }}>
              <div
                className='absolute top-1/2 -translate-y-1/2 h-4 w-4 -ml-2 rounded-full border-2 border-white shadow'
                style={{ left: `${(h / 360) * 100}%` }}
              />
            </div>
          </div>

          <div className='grid grid-cols-3 gap-3'>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.r")}</Label>
              <Input
                inputMode='numeric'
                value={r}
                onChange={(e) => {
                  setColorState((current) =>
                    createColorStateFromRgb(
                      rgbChannelFromInput(e.target.value, current.r),
                      current.g,
                      current.b,
                    ),
                  );
                }}
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.g")}</Label>
              <Input
                inputMode='numeric'
                value={g}
                onChange={(e) => {
                  setColorState((current) =>
                    createColorStateFromRgb(
                      current.r,
                      rgbChannelFromInput(e.target.value, current.g),
                      current.b,
                    ),
                  );
                }}
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.b")}</Label>
              <Input
                inputMode='numeric'
                value={b}
                onChange={(e) => {
                  setColorState((current) =>
                    createColorStateFromRgb(
                      current.r,
                      current.g,
                      rgbChannelFromInput(e.target.value, current.b),
                    ),
                  );
                }}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t("plugins.themes.cancel")}
          </Button>
          <Button onClick={apply}>{t("plugins.themes.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
