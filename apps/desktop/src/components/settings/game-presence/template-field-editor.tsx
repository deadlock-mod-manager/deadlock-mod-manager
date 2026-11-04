import type { PresenceTextTemplatePair } from "@deadlock-mods/deadlock-discord-presence";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import type { TemplateKey } from "@/components/settings/game-presence/presence-templates";
import type { TemplateField } from "@/components/settings/game-presence/presence-templates";
import type { TemplateRow } from "@/components/settings/game-presence/presence-templates";
import { PlaceholderButtons } from "@/components/settings/game-presence/placeholder-buttons";

interface TemplateFieldEditorProps {
  field: TemplateField;
  selectedHeroCodename: string | null;
  selectedRow: TemplateRow;
  selectedTemplate: PresenceTextTemplatePair;
  selectedGlobalTemplate: PresenceTextTemplatePair;
  onUpdate: (key: TemplateKey, field: TemplateField, value: string) => void;
  onInsertPlaceholder: (field: TemplateField, placeholder: string) => void;
  t: (key: string, options?: Record<string, string>) => string;
}

export const TemplateFieldEditor = ({
  field,
  selectedHeroCodename,
  selectedRow,
  selectedTemplate,
  selectedGlobalTemplate,
  onUpdate,
  onInsertPlaceholder,
  t,
}: TemplateFieldEditorProps) => {
  const fallback = formatFallbackText(
    fieldFallback(selectedGlobalTemplate, selectedRow, field),
    t("gamePresence.emptyLine"),
  );

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-3'>
        <Label
          className='font-medium text-sm'
          htmlFor={`${selectedHeroCodename ?? "global"}-${selectedRow.key}-${field}`}>
          {field === "details"
            ? t("gamePresence.detailsTemplate")
            : t("gamePresence.stateTemplate")}
        </Label>
        <p className='text-muted-foreground text-xs'>
          {selectedHeroCodename === null
            ? t("gamePresence.defaultValue", { value: fallback })
            : t("gamePresence.fallbackValue", { value: fallback })}
        </p>
      </div>
      <Input
        className='h-10 bg-background/70'
        id={`${selectedHeroCodename ?? "global"}-${selectedRow.key}-${field}`}
        name={`${selectedRow.key}-${field}`}
        onChange={(event) =>
          onUpdate(selectedRow.key, field, event.target.value)
        }
        placeholder={
          selectedHeroCodename === null
            ? fieldFallback(selectedGlobalTemplate, selectedRow, field)
            : t("gamePresence.heroOverrides.inheritPlaceholder")
        }
        value={selectedTemplate[field]}
      />
      <div className='space-y-1.5'>
        <p className='text-muted-foreground text-xs'>
          {field === "details"
            ? t("gamePresence.insertIntoDetails")
            : t("gamePresence.insertIntoState")}
        </p>
        <PlaceholderButtons
          field={field}
          onInsert={onInsertPlaceholder}
          t={t}
        />
      </div>
    </div>
  );
};

function fieldFallback(
  template: PresenceTextTemplatePair,
  row: TemplateRow,
  field: TemplateField,
): string {
  const globalValue = template[field].trim();
  if (globalValue !== "") {
    return globalValue;
  }

  return field === "details" ? row.defaultDetails : row.defaultState;
}

function formatFallbackText(value: string, emptyText: string): string {
  return value.trim() === "" ? emptyText : value;
}
