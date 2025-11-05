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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export const LineColorPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(0); // 0-360
  const [s, setS] = useState(100); // 0-100 (HSV)
  const [v, setV] = useState(100); // 0-100 (HSV)
  const [r, setR] = useState(0);
  const [g, setG] = useState(0);
  const [b, setB] = useState(0);
  const svRef = useRef<HTMLDivElement | null>(null);

  const hexToRgb = useCallback((hexStr: string) => {
    const m = hexStr.replace("#", "");
    const full =
      m.length === 3
        ? m
            .split("")
            .map((c) => c + c)
            .join("")
        : m;
    const bigint = parseInt(full, 16);
    const rr = (bigint >> 16) & 255;
    const gg = (bigint >> 8) & 255;
    const bb = bigint & 255;
    return { r: rr, g: gg, b: bb };
  }, []);

  const rgbToHex = useCallback((rr: number, gg: number, bb: number) => {
    const toHex = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`.toLowerCase();
  }, []);

  const rgbToHsv = useCallback((rr: number, gg: number, bb: number) => {
    const rN = rr / 255;
    const gN = gg / 255;
    const bN = bb / 255;
    const max = Math.max(rN, gN, bN);
    const min = Math.min(rN, gN, bN);
    const d = max - min;
    let hh = 0;
    if (d !== 0) {
      switch (max) {
        case rN:
          hh = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60;
          break;
        case gN:
          hh = ((bN - rN) / d + 2) * 60;
          break;
        default:
          hh = ((rN - gN) / d + 4) * 60;
      }
    }
    const ss = max === 0 ? 0 : (d / max) * 100;
    const vv = max * 100;
    return { h: Math.round(hh), s: Math.round(ss), v: Math.round(vv) };
  }, []);

  const hsvToRgb = useCallback((hh: number, ss: number, vv: number) => {
    const sN = ss / 100;
    const vN = vv / 100;
    const c = vN * sN;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m2 = vN - c;
    let r1 = 0,
      g1 = 0,
      b1 = 0;
    const hSeg = Math.floor((hh % 360) / 60);
    switch (hSeg) {
      case 0:
        r1 = c;
        g1 = x;
        b1 = 0;
        break;
      case 1:
        r1 = x;
        g1 = c;
        b1 = 0;
        break;
      case 2:
        r1 = 0;
        g1 = c;
        b1 = x;
        break;
      case 3:
        r1 = 0;
        g1 = x;
        b1 = c;
        break;
      case 4:
        r1 = x;
        g1 = 0;
        b1 = c;
        break;
      default:
        r1 = c;
        g1 = 0;
        b1 = x;
        break;
    }
    return {
      r: Math.round((r1 + m2) * 255),
      g: Math.round((g1 + m2) * 255),
      b: Math.round((b1 + m2) * 255),
    };
  }, []);

  const currentHex = useMemo(() => rgbToHex(r, g, b), [r, g, b, rgbToHex]);
  const baseHueColor = useMemo(() => {
    const { r: rr, g: gg, b: bb } = hsvToRgb(h, 100, 100);
    return `rgb(${rr}, ${gg}, ${bb})`;
  }, [h, hsvToRgb]);

  const apply = () => {
    onChange(currentHex);
    setOpen(false);
  };

  // initialize from value
  useEffect(() => {
    try {
      const { r: rr, g: gg, b: bb } = hexToRgb(value);
      setR(rr);
      setG(gg);
      setB(bb);
      const { h: hh, s: ss, v: vv } = rgbToHsv(rr, gg, bb);
      setH(hh);
      setS(ss);
      setV(vv);
    } catch {}
  }, [value, hexToRgb, rgbToHsv]);

  useEffect(() => {
    const { r: rr, g: gg, b: bb } = hsvToRgb(h, s, v);
    setR(rr);
    setG(gg);
    setB(bb);
  }, [h, s, v, hsvToRgb]);

  return (
    <div className='flex items-center gap-3'>
      <label className='text-sm font-medium'>
        {t("plugins.themes.lineColor")}
      </label>
      <div className='inline-flex items-center justify-center rounded-md border border-input/70 p-1 leading-none'>
        <button
          type='button'
          onClick={() => setOpen(true)}
          className='block h-7 w-10 rounded-sm bg-transparent'
          aria-label={t("plugins.themes.pickColor") ?? "Pick color"}
          style={{ backgroundColor: value }}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>
              {t("plugins.themes.lineColorDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("plugins.themes.lineColorDialogDescription")}
            </DialogDescription>
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
                onClick={async () => {
                  // @ts-expect-error EyeDropper may exist in Chromium
                  if (typeof window !== "undefined" && window.EyeDropper) {
                    try {
                      // @ts-expect-error - browser API
                      const eye = new window.EyeDropper();
                      const res = await eye.open();
                      if (res?.sRGBHex) onChange(res.sRGBHex.toLowerCase());
                      setOpen(false);
                    } catch {}
                  }
                }}
                className='gap-2'>
                <Eyedropper size={16} />
                {t("plugins.themes.eyedropper")}
              </Button>
            </div>

            <div className='flex flex-col gap-3'>
              <div
                ref={svRef}
                onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
                  const move = (ev: MouseEvent) => {
                    const rect = (
                      e.currentTarget as HTMLDivElement
                    ).getBoundingClientRect();
                    const x =
                      ev.clientX - rect.left < 0
                        ? 0
                        : ev.clientX - rect.left > rect.width
                          ? rect.width
                          : ev.clientX - rect.left;
                    const y =
                      ev.clientY - rect.top < 0
                        ? 0
                        : ev.clientY - rect.top > rect.height
                          ? rect.height
                          : ev.clientY - rect.top;
                    const sN = Math.round((x / rect.width) * 100);
                    const vN = Math.round(100 - (y / rect.height) * 100);
                    setS(sN);
                    setV(vN);
                  };
                  move(e.nativeEvent as unknown as MouseEvent);
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
                onTouchStart={(e) => {
                  const rect = (
                    e.currentTarget as HTMLDivElement
                  ).getBoundingClientRect();
                  const touch = e.touches[0];
                  const x =
                    touch.clientX - rect.left < 0
                      ? 0
                      : touch.clientX - rect.left > rect.width
                        ? rect.width
                        : touch.clientX - rect.left;
                  const y =
                    touch.clientY - rect.top < 0
                      ? 0
                      : touch.clientY - rect.top > rect.height
                        ? rect.height
                        : touch.clientY - rect.top;
                  const sN = Math.round((x / rect.width) * 100);
                  const vN = Math.round(100 - (y / rect.height) * 100);
                  setS(sN);
                  setV(vN);
                }}
                onTouchMove={(e) => {
                  const rect = (
                    e.currentTarget as HTMLDivElement
                  ).getBoundingClientRect();
                  const touch = e.touches[0];
                  const x =
                    touch.clientX - rect.left < 0
                      ? 0
                      : touch.clientX - rect.left > rect.width
                        ? rect.width
                        : touch.clientX - rect.left;
                  const y =
                    touch.clientY - rect.top < 0
                      ? 0
                      : touch.clientY - rect.top > rect.height
                        ? rect.height
                        : touch.clientY - rect.top;
                  const sN = Math.round((x / rect.width) * 100);
                  const vN = Math.round(100 - (y / rect.height) * 100);
                  setS(sN);
                  setV(vN);
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
                onMouseDown={(e: React.MouseEvent<HTMLDivElement>) => {
                  const rect = (
                    e.currentTarget as HTMLDivElement
                  ).getBoundingClientRect();
                  const move = (ev: MouseEvent) => {
                    const x =
                      ev.clientX - rect.left < 0
                        ? 0
                        : ev.clientX - rect.left > rect.width
                          ? rect.width
                          : ev.clientX - rect.left;
                    const hh = Math.round((x / rect.width) * 360);
                    setH(hh);
                  };
                  move(e.nativeEvent as unknown as MouseEvent);
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
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
                    const n = Math.max(
                      0,
                      Math.min(255, Number(e.target.value || 0)),
                    );
                    setR(n);
                    const { h: hh, s: ss, v: vv } = rgbToHsv(n, g, b);
                    setH(hh);
                    setS(ss);
                    setV(vv);
                  }}
                />
              </div>
              <div>
                <Label className='mb-1 block'>{t("plugins.themes.g")}</Label>
                <Input
                  inputMode='numeric'
                  value={g}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.min(255, Number(e.target.value || 0)),
                    );
                    setG(n);
                    const { h: hh, s: ss, v: vv } = rgbToHsv(r, n, b);
                    setH(hh);
                    setS(ss);
                    setV(vv);
                  }}
                />
              </div>
              <div>
                <Label className='mb-1 block'>{t("plugins.themes.b")}</Label>
                <Input
                  inputMode='numeric'
                  value={b}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.min(255, Number(e.target.value || 0)),
                    );
                    setB(n);
                    const { h: hh, s: ss, v: vv } = rgbToHsv(r, g, n);
                    setH(hh);
                    setS(ss);
                    setV(vv);
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={() => setOpen(false)}>
              {t("plugins.themes.cancel")}
            </Button>
            <Button onClick={apply}>{t("plugins.themes.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
