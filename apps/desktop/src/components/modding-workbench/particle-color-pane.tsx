import { Button } from "@deadlock-mods/ui/components/button";
import { ColorPicker } from "@deadlock-mods/ui/components/color-picker";
import { Input } from "@deadlock-mods/ui/components/input";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  particleHex,
  particleRgb,
  sharedParticleColors,
  recolorParticleFiles,
} from "@/lib/particle-colors";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";
import type { ModdingParticleColorEdit } from "@/types/generated/ModdingParticleColorEdit";
import { ParticleList } from "./particle-list";
import { ParticlePalettes } from "./particle-palettes";

export function ParticleColorPane({
  file,
  files,
  shared,
  busy,
  onEdit,
}: {
  file: ModdingParticleFile | undefined;
  files: ModdingParticleFile[];
  shared: boolean;
  busy: boolean;
  onEdit: (edits: ModdingParticleColorEdit[], label: string) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState("");
  const [hex, setHex] = useState("#ff8800");
  const [threshold, setThreshold] = useState(0);
  const groups = useMemo(
    () => (shared ? sharedParticleColors(files, threshold) : []),
    [files, threshold, shared],
  );
  const group = groups.find((group) => group.hex === selected);
  const color = file?.colors.find((color) => color.path === selected);
  const rgb = particleRgb(hex);
  const apply = () => {
    if (!rgb) return;
    if (shared && group) {
      const edits = group.files.map((path) => ({
        path,
        text: files.find((file) => file.path === path)?.text ?? "",
        changes: group.fields
          .filter((field) => field.file === path)
          .map((field) => ({ path: field.color.path, rgb })),
      }));
      onEdit(
        edits,
        t("particleColors.sharedApplied", {
          color: group.hex,
          replacement: hex,
        }),
      );
    } else if (!shared && file && color) {
      onEdit(
        [
          {
            path: file.path,
            text: file.text,
            changes: [{ path: color.path, rgb }],
          },
        ],
        t("particleColors.colorApplied", { field: color.path, color: hex }),
      );
    }
  };
  const targets = rgb ? recolorParticleFiles(files, rgb) : [];
  const rows = shared
    ? groups.map((group) => ({
        id: group.hex,
        label: group.hex,
        hex: group.hex,
        detail: t("particleColors.matches", {
          count: group.fields.length,
          files: group.files.length,
        }),
      }))
    : (file?.colors ?? []).map((color) => ({
        id: color.path,
        label: color.path.split("/").at(-1) ?? color.path,
        hex: particleHex(color.rgb),
        detail: `${color.path}${color.alpha === null ? "" : ` · α ${color.alpha}`}`,
      }));
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      {shared ? (
        <div className='space-y-1 border-b p-3'>
          <label
            className='flex items-center justify-between gap-2 text-xs'
            htmlFor='particle-color-threshold'>
            {t("particleColors.tolerance")} <span>{threshold}%</span>
          </label>
          <Input
            id='particle-color-threshold'
            type='range'
            min={0}
            max={100}
            step={1}
            value={threshold}
            disabled={busy}
            onChange={(event) => {
              setThreshold(Number(event.target.value));
              setSelected("");
            }}
            className='h-6 border-0 p-0'
          />
          <p className='text-[11px] text-muted-foreground'>
            {t("particleColors.toleranceHint")}
          </p>
          <p className='text-xs font-medium'>
            {t("particleColors.batchScope", { count: files.length })}
          </p>
        </div>
      ) : null}
      <div className='flex min-h-0 flex-1 flex-col overflow-auto md:flex-row'>
        <div className='flex min-h-48 min-w-0 flex-1 flex-col border-r'>
          {rows.length ? (
            <ParticleList
              items={rows}
              active={selected}
              label={t(
                shared ? "particleColors.shared" : "particleColors.fields",
              )}
              disabled={busy}
              onSelect={(id) => {
                setSelected(id);
                const match = rows.find((row) => row.id === id);
                if (match) setHex(match.hex);
              }}
            />
          ) : (
            <p className='p-4 text-sm text-muted-foreground'>
              {t(
                shared ? "particleColors.noShared" : "particleColors.noColors",
              )}
            </p>
          )}
          {shared && group ? (
            <div className='max-h-28 overflow-auto border-t p-2 text-xs text-muted-foreground'>
              {group.files.map((path) => (
                <p key={path} className='truncate' title={path}>
                  {path}
                </p>
              ))}
            </div>
          ) : null}
        </div>
        <div className='w-full shrink-0 space-y-3 overflow-auto p-3 md:w-72'>
          <fieldset disabled={busy} className='space-y-2'>
            <ColorPicker
              value={hex}
              onChange={setHex}
              labels={{
                red: t("particleColors.red"),
                green: t("particleColors.green"),
                blue: t("particleColors.blue"),
                eyedropper: t("particleColors.eyedropper"),
              }}
            />
            <Input
              aria-label={t("particleColors.hex")}
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              className='font-mono text-xs'
            />
            <Button
              size='sm'
              className='w-full'
              disabled={busy || !rgb || !(shared ? group : color)}
              onClick={apply}>
              {t(
                shared
                  ? "particleColors.applyShared"
                  : "particleColors.applyColor",
              )}
            </Button>
            {shared ? (
              <>
                <Button
                  size='sm'
                  variant='outline'
                  className='w-full'
                  disabled={
                    busy ||
                    !rgb ||
                    !targets.length ||
                    files.some((file) => !!file.diagnostic)
                  }
                  onClick={() =>
                    onEdit(
                      targets,
                      t("particleColors.allRecolored", {
                        count: targets.length,
                        color: hex,
                      }),
                    )
                  }>
                  {t("particleColors.recolorSelected", { count: files.length })}
                </Button>
                <p className='text-[11px] text-muted-foreground'>
                  {t("particleColors.recolorHint")}
                </p>
              </>
            ) : null}
          </fieldset>
          <ParticlePalettes
            validColor={!!rgb}
            color={rgb ? particleHex(rgb) : "#ff8800"}
            onSelect={setHex}
          />
        </div>
      </div>
    </div>
  );
}
