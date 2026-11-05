import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetChip } from "@/components/server-picker/preset-chip";
import { countPickerChanges } from "@/lib/server-picker";
import type { ServerPickerPreset } from "@/types/generated/ServerPickerPreset";

interface PickerPresetsProps {
  presets: ServerPickerPreset[];
  blockedLocations: string[];
  appliedLocations: string[] | null;
  disabled: boolean;
  loadDisabled: boolean;
  saving: boolean;
  onLoad: (blockedLocations: string[]) => void;
  onDelete: (id: string) => void;
  onSave: (name: string, onSaved: () => void) => void;
}

export const PickerPresets = ({
  presets,
  blockedLocations,
  appliedLocations,
  disabled,
  loadDisabled,
  saving,
  onLoad,
  onDelete,
  onSave,
}: PickerPresetsProps) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const close = () => {
    setName("");
    setEditing(false);
  };
  return (
    <div
      role='group'
      aria-label={t("serverPicker.presets")}
      className='flex min-h-8 flex-wrap items-center gap-1.5'>
      <span className='mr-1 text-xs font-medium text-muted-foreground'>
        {t("serverPicker.presets")}
      </span>
      {presets.map((preset) => {
        const selected =
          countPickerChanges(preset.blockedLocations, blockedLocations) === 0;
        return (
          <PresetChip
            key={preset.id}
            preset={preset}
            selected={selected}
            applied={
              selected &&
              appliedLocations !== null &&
              countPickerChanges(preset.blockedLocations, appliedLocations) ===
                0
            }
            loadDisabled={disabled || loadDisabled}
            deleteDisabled={disabled}
            onLoad={() => onLoad(preset.blockedLocations)}
            onDelete={() => onDelete(preset.id)}
          />
        );
      })}
      {editing ? (
        <form
          className='flex items-center gap-1'
          onKeyDown={(event) => {
            if (event.key === "Escape" && !saving) close();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || saving || disabled) return;
            onSave(name.trim(), close);
          }}>
          <Input
            autoFocus
            aria-label={t("serverPicker.presetName")}
            placeholder={t("serverPicker.presetName")}
            className='h-7 w-40 rounded-full px-3 text-xs'
            maxLength={64}
            disabled={saving}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            size='sm'
            type='submit'
            className='h-7 rounded-full px-3 text-xs'
            disabled={disabled || !name.trim()}
            isLoading={saving}>
            {t("serverPicker.savePreset")}
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='size-7 rounded-full'
            type='button'
            aria-label={t("serverPicker.cancel")}
            disabled={saving}
            onClick={close}>
            <XIcon aria-hidden />
          </Button>
        </form>
      ) : (
        <button
          type='button'
          disabled={disabled}
          className='inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
          onClick={() => setEditing(true)}>
          <PlusIcon aria-hidden className='size-3' />
          {t("serverPicker.newPreset")}
        </button>
      )}
      {presets.length === 0 && !editing && (
        <span className='ml-1 text-[11px] text-muted-foreground'>
          {t("serverPicker.presetHint")}
        </span>
      )}
    </div>
  );
};
