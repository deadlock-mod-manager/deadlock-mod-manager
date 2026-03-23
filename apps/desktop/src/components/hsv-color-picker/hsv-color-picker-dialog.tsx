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
  useRef,
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
  const [h, setH] = useState(0);
  const [s, setS] = useState(100);
  const [v, setV] = useState(100);
  const [r, setR] = useState(0);
  const [g, setG] = useState(0);
  const [b, setB] = useState(0);
  const skipHsvToRgbAfterOpenSyncRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const normalized = normalizeHex(colorHex, fallbackHex);
    const rgb = hexToRgb(normalized);
    if (rgb === null) {
      return;
    }
    skipHsvToRgbAfterOpenSyncRef.current = true;
    const { r: rr, g: gg, b: bb } = rgb;
    setR(rr);
    setG(gg);
    setB(bb);
    const hsv = rgbToHsv(rr, gg, bb);
    setH(hsv.h);
    setS(hsv.s);
    setV(hsv.v);
  }, [open, colorHex, fallbackHex]);

  useEffect(() => {
    if (skipHsvToRgbAfterOpenSyncRef.current) {
      skipHsvToRgbAfterOpenSyncRef.current = false;
      return;
    }
    const { r: rr, g: gg, b: bb } = hsvToRgb(h, s, v);
    setR(rr);
    setG(gg);
    setB(bb);
  }, [h, s, v]);

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
        const { r: rr, g: gg, b: bb } = rgb;
        setR(rr);
        setG(gg);
        setB(bb);
        const hsv = rgbToHsv(rr, gg, bb);
        setH(hsv.h);
        setS(hsv.s);
        setV(hsv.v);
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
    setS(sN);
    setV(vN);
  };

  const setHueFromClient = (rect: DOMRect, clientX: number) => {
    const x =
      clientX - rect.left < 0
        ? 0
        : clientX - rect.left > rect.width
          ? rect.width
          : clientX - rect.left;
    setH(Math.round((x / rect.width) * 360));
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
                  const n = rgbChannelFromInput(e.target.value, r);
                  setR(n);
                  const hsv = rgbToHsv(n, g, b);
                  setH(hsv.h);
                  setS(hsv.s);
                  setV(hsv.v);
                }}
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.g")}</Label>
              <Input
                inputMode='numeric'
                value={g}
                onChange={(e) => {
                  const n = rgbChannelFromInput(e.target.value, g);
                  setG(n);
                  const hsv = rgbToHsv(r, n, b);
                  setH(hsv.h);
                  setS(hsv.s);
                  setV(hsv.v);
                }}
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.b")}</Label>
              <Input
                inputMode='numeric'
                value={b}
                onChange={(e) => {
                  const n = rgbChannelFromInput(e.target.value, b);
                  setB(n);
                  const hsv = rgbToHsv(r, g, n);
                  setH(hsv.h);
                  setS(hsv.s);
                  setV(hsv.v);
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
