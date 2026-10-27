import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@deadlock-mods/ui/components/context-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingParticlePalette } from "@/types/generated/ModdingParticlePalette";

const PALETTE_DRAG = "application/x-dmm-particle-palette-color";
export function ParticlePalettes({
  color,
  onSelect,
  validColor,
}: {
  color: string;
  validColor: boolean;
  onSelect: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const palettes = useQuery({
    queryKey: ["workbench-particle-palettes"],
    queryFn: () =>
      invoke<ModdingParticlePalette[]>("get_modding_particle_palettes"),
  });
  const current =
    palettes.data?.find((palette) => palette.id === selected) ??
    palettes.data?.[0];
  const save = useMutation({
    mutationFn: (palette: ModdingParticlePalette) =>
      invoke("save_modding_particle_palette", { palette }),
    onSuccess: async (_, palette) => {
      setSelected(palette.id);
      setName("");
      await client.invalidateQueries({
        queryKey: ["workbench-particle-palettes"],
      });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      invoke("delete_modding_particle_palette", { id }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["workbench-particle-palettes"] }),
  });
  const busy = save.isPending || remove.isPending;
  return (
    <section
      className='space-y-2 border-t pt-2'
      aria-label={t("particleColors.palettes")}>
      <h3 className='text-xs font-medium'>{t("particleColors.palettes")}</h3>
      {palettes.data?.length ? (
        <select
          className='w-full rounded border bg-background p-1 text-xs'
          aria-label={t("particleColors.palette")}
          value={current?.id ?? ""}
          disabled={busy}
          onChange={(event) => setSelected(event.target.value)}>
          {palettes.data.map((palette) => (
            <option key={palette.id} value={palette.id}>
              {palette.name}
            </option>
          ))}
        </select>
      ) : null}
      <div className='flex flex-wrap gap-1'>
        {current?.colors.map((hex, index) => (
          <ContextMenu key={`${current.id}:${hex}`}>
            <ContextMenuTrigger asChild>
              <button
                type='button'
                className='size-7 rounded border'
                style={{ backgroundColor: hex }}
                aria-label={hex}
                title={hex}
                disabled={busy}
                draggable={!busy}
                onClick={() => onSelect(hex)}
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    PALETTE_DRAG,
                    `${current.id}:${index}`,
                  )
                }
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(PALETTE_DRAG))
                    event.preventDefault();
                }}
                onDrop={(event) => {
                  const [id, value] = event.dataTransfer
                    .getData(PALETTE_DRAG)
                    .split(":");
                  const from = Number(value);
                  if (
                    id !== current.id ||
                    !Number.isInteger(from) ||
                    from < 0 ||
                    from >= current.colors.length
                  )
                    return;
                  event.preventDefault();
                  const colors = [...current.colors];
                  const moved = colors.splice(from, 1)[0];
                  if (moved) {
                    colors.splice(index, 0, moved);
                    save.mutate({ ...current, colors });
                  }
                }}
              />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() =>
                  save.mutate({
                    ...current,
                    colors: current.colors.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }>
                {t("particleColors.removeSwatch")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
      <div className='flex flex-wrap gap-1'>
        <Button
          size='sm'
          variant='outline'
          disabled={
            busy ||
            !validColor ||
            !current ||
            current.colors.length >= 64 ||
            current.colors.includes(color)
          }
          onClick={() => {
            if (current)
              save.mutate({ ...current, colors: [...current.colors, color] });
          }}>
          {t("particleColors.saveSwatch")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || !current}
          onClick={() => {
            if (current) remove.mutate(current.id);
          }}>
          {t("particleColors.deletePalette")}
        </Button>
      </div>
      <Input
        value={name}
        maxLength={128}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("particleColors.paletteName")}
        aria-label={t("particleColors.paletteName")}
        className='h-8 text-xs'
      />
      <div className='flex gap-1'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || !validColor || !name.trim()}
          onClick={() =>
            save.mutate({ id: crypto.randomUUID(), name, colors: [color] })
          }>
          {t("particleColors.newPalette")}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || !current || !name.trim()}
          onClick={() => {
            if (current) save.mutate({ ...current, name });
          }}>
          {t("particleColors.renamePalette")}
        </Button>
      </div>
      {palettes.error || save.error || remove.error ? (
        <p role='alert' className='text-xs text-destructive'>
          {palettes.error?.message ??
            save.error?.message ??
            remove.error?.message}
        </p>
      ) : null}
    </section>
  );
}
