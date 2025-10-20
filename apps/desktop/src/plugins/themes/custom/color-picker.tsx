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
import { useCallback, useEffect, useState } from "react";
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
  const [h, setH] = useState(0);
  const [s, setS] = useState(0);
  const [l, setL] = useState(0);
  const [hex, setHex] = useState(value);

  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));

  const hexToHsl = useCallback((hexStr: string) => {
    const m = hexStr.replace("#", "");
    const full =
      m.length === 3
        ? m
            .split("")
            .map((c) => c + c)
            .join("")
        : m;
    const bigint = parseInt(full, 16);
    const r = ((bigint >> 16) & 255) / 255;
    const g = ((bigint >> 8) & 255) / 255;
    const b = (bigint & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h2 = 0;
    let s2 = 0;
    const l2 = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s2 = l2 > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h2 = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h2 = (b - r) / d + 2;
          break;
        case b:
          h2 = (r - g) / d + 4;
          break;
      }
      h2 /= 6;
    }
    return {
      h: Math.round(h2 * 360),
      s: Math.round(s2 * 100),
      l: Math.round(l2 * 100),
    };
  }, []);

  const hslToHex = useCallback((h2: number, s2: number, l2: number) => {
    const sNorm = s2 / 100;
    const lNorm = l2 / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h2 / 60) % 2) - 1));
    const m2 = lNorm - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h2 >= 0 && h2 < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h2 < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h2 < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h2 < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h2 < 300) {
      r = x;
      g = 0;
      b = c;
    } else {
      r = c;
      g = 0;
      b = x;
    }
    const to255 = (v: number) => Math.round((v + m2) * 255);
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    const rr = to255(r),
      gg = to255(g),
      bb = to255(b);
    return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`.toLowerCase();
  }, []);

  const apply = () => {
    const out = hslToHex(clamp(h, 0, 360), clamp(s, 0, 100), clamp(l, 0, 100));
    onChange(out);
    setHex(out);
    setOpen(false);
  };

  // initialize from value
  useEffect(() => {
    try {
      const { h: hh, s: ss, l: ll } = hexToHsl(value);
      setH(hh);
      setS(ss);
      setL(ll);
      setHex(value);
    } catch {
      // ignore invalid values
    }
  }, [value, hexToHsl]);

  return (
    <div className='space-y-4'>
      <label className='text-sm font-medium'>{t("plugins.themes.lineColor")}</label>
      <div className='flex items-center gap-3'>
        <div
          className='h-7 w-10 rounded border'
          style={{ backgroundColor: value }}
        />
        <Button variant='outline' onClick={() => setOpen(true)}>
          {t("plugins.themes.pickColor")}
        </Button>
        <span className='text-xs text-muted-foreground'>{value}</span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='sm:max-w-[500px]'>
          <DialogHeader>
            <DialogTitle>{t("plugins.themes.lineColorDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("plugins.themes.lineColorDialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className='flex flex-col gap-4'>
            <div className='flex items-center gap-3'>
              <div
                className='h-8 w-12 rounded border'
                style={{ backgroundColor: `hsl(${h} ${s}% ${l}%)` }}
              />
              <Input
                value={hex}
                onChange={(e) => {
                  const next = e.target.value;
                  setHex(next);
                  try {
                    const { h: hh, s: ss, l: ll } = hexToHsl(next);
                    setH(hh);
                    setS(ss);
                    setL(ll);
                  } catch {
                    // ignore invalid
                  }
                }}
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.hue")}: {h}</Label>
              <input
                type='range'
                min={0}
                max={360}
                value={h}
                onChange={(e) => setH(Number(e.target.value))}
                className='w-full'
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.saturation")}: {s}%</Label>
              <input
                type='range'
                min={0}
                max={100}
                value={s}
                onChange={(e) => setS(Number(e.target.value))}
                className='w-full'
              />
            </div>
            <div>
              <Label className='mb-1 block'>{t("plugins.themes.lightness")}: {l}%</Label>
              <input
                type='range'
                min={0}
                max={100}
                value={l}
                onChange={(e) => setL(Number(e.target.value))}
                className='w-full'
              />
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
