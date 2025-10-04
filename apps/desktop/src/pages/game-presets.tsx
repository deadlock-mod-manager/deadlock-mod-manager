import { Plus, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivePresetCard } from "@/components/game-presets/active-preset-card";
import { ApplyPreviewDialog } from "@/components/game-presets/apply-preview-dialog";
import { ImportPresetDialog } from "@/components/game-presets/import-preset-dialog";
import { OptionEditorDialog } from "@/components/game-presets/option-editor-dialog";
import { OptionsTable } from "@/components/game-presets/options-table";
import { PresetEditorDialog } from "@/components/game-presets/preset-editor-dialog";
import { PresetsTable } from "@/components/game-presets/presets-table";
import PageTitle from "@/components/shared/page-title";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MOCK_CURRENT_CONFIG,
  MOCK_OPTIONS,
  MOCK_PRESETS,
} from "@/lib/mock-data/game-presets";
import type { ExtractedConVar, Option, Preset } from "@/types/game-presets";

const GamePresets = () => {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<Preset[]>(MOCK_PRESETS);
  const [options, setOptions] = useState<Option[]>(MOCK_OPTIONS);
  const [currentConfig] = useState<Record<string, string>>(MOCK_CURRENT_CONFIG);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [editingOption, setEditingOption] = useState<Option | null>(null);
  const [applyingPreset, setApplyingPreset] = useState<Preset | null>(null);

  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [optionDialogOpen, setOptionDialogOpen] = useState(false);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleNewPreset = () => {
    setEditingPreset(null);
    setPresetDialogOpen(true);
  };

  const handleEditPreset = (preset: Preset) => {
    setEditingPreset(preset);
    setPresetDialogOpen(true);
  };

  const handleDuplicatePreset = (preset: Preset) => {
    const newPreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      name: `${preset.name} (Copy)`,
    };
    setPresets([...presets, newPreset]);
  };

  const handleDeletePreset = (preset: Preset) => {
    if (
      window.confirm(
        `${t("gamePresets.confirmDeletePreset")} "${preset.name}"?`,
      )
    ) {
      if (activePresetId === preset.id) {
        setActivePresetId(null);
      }
      setPresets(presets.filter((p) => p.id !== preset.id));
    }
  };

  const handleSavePreset = (preset: Preset) => {
    if (editingPreset) {
      setPresets(presets.map((p) => (p.id === preset.id ? preset : p)));
    } else {
      setPresets([...presets, preset]);
    }
  };

  const handleTogglePreset = (preset: Preset) => {
    if (activePresetId === preset.id) {
      setActivePresetId(null);
      console.log("Deactivating preset:", preset);
    } else {
      setApplyingPreset(preset);
      setApplyDialogOpen(true);
    }
  };

  const handleConfirmApply = () => {
    if (applyingPreset) {
      setActivePresetId(applyingPreset.id);
      console.log("Applying preset:", applyingPreset);
    }
  };

  const handleDeactivate = () => {
    setActivePresetId(null);
  };

  const handleNewOption = () => {
    setEditingOption(null);
    setOptionDialogOpen(true);
  };

  const handleEditOption = (option: Option) => {
    setEditingOption(option);
    setOptionDialogOpen(true);
  };

  const handleDeleteOption = (option: Option) => {
    if (
      window.confirm(
        `${t("gamePresets.confirmDeleteOption")} "${option.label}"?`,
      )
    ) {
      setOptions(options.filter((o) => o.id !== option.id));
      setPresets(
        presets.map((preset) => {
          const newValues = { ...preset.values };
          delete newValues[option.id];
          return { ...preset, values: newValues };
        }),
      );
    }
  };

  const handleSaveOption = (option: Option) => {
    if (editingOption) {
      setOptions(options.map((o) => (o.id === option.id ? option : o)));
    } else {
      setOptions([...options, option]);
    }
  };

  const handleImportPreset = (
    convars: ExtractedConVar[],
    presetName: string,
  ) => {
    const newOptions: Option[] = [];
    const presetValues: Record<string, string> = {};

    for (const convar of convars) {
      const existingOption = options.find((opt) => opt.varName === convar.key);

      if (existingOption) {
        presetValues[existingOption.id] = convar.value;
      } else {
        const newOptionId = `opt-${Date.now()}-${Math.random()}`;
        const isNumeric = !Number.isNaN(Number.parseFloat(convar.value));

        const newOption: Option = {
          id: newOptionId,
          key: newOptionId,
          varName: convar.key,
          valueType: isNumeric ? "number" : "string",
          label: convar.key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          defaultValue: convar.value,
        };

        if (isNumeric) {
          const numValue = Number.parseFloat(convar.value);
          newOption.min = Math.floor(numValue * 0.5);
          newOption.max = Math.ceil(numValue * 2);
        } else {
          newOption.stringAllowed = [convar.value];
        }

        newOptions.push(newOption);
        presetValues[newOptionId] = convar.value;
      }
    }

    if (newOptions.length > 0) {
      setOptions([...options, ...newOptions]);
    }

    const newPreset: Preset = {
      id: `preset-${Date.now()}`,
      name: presetName,
      description: `Imported from gameinfo.gi on ${new Date().toLocaleDateString()}`,
      values: presetValues,
    };

    setPresets([...presets, newPreset]);
  };

  const activePreset = presets.find((p) => p.id === activePresetId) || null;

  return (
    <div className='h-[calc(100vh-160px)] w-full px-4'>
      <div className='space-y-6'>
        <PageTitle
          subtitle={t("gamePresets.subtitle")}
          title={t("gamePresets.title")}
        />

        <ActivePresetCard
          activePreset={activePreset}
          onDeactivate={handleDeactivate}
        />

        <Tabs className='w-full' defaultValue='presets'>
          <div className='flex items-center justify-between'>
            <TabsList>
              <TabsTrigger value='presets'>
                {t("gamePresets.presets")} ({presets.length})
              </TabsTrigger>
              <TabsTrigger value='options'>
                {t("gamePresets.options")} ({options.length})
              </TabsTrigger>
            </TabsList>
            <div className='flex gap-2'>
              <Button
                onClick={() => setImportDialogOpen(true)}
                variant='outline'>
                <Upload className='mr-1 h-4 w-4' />
                {t("gamePresets.importPreset")}
              </Button>
              <Button onClick={handleNewOption} variant='outline'>
                <Plus className='mr-1 h-4 w-4' />
                {t("gamePresets.newOption")}
              </Button>
              <Button onClick={handleNewPreset}>
                <Plus className='mr-1 h-4 w-4' />
                {t("gamePresets.newPreset")}
              </Button>
            </div>
          </div>

          <TabsContent className='mt-4' value='presets'>
            <PresetsTable
              activePresetId={activePresetId}
              onDelete={handleDeletePreset}
              onDuplicate={handleDuplicatePreset}
              onEdit={handleEditPreset}
              onToggle={handleTogglePreset}
              presets={presets}
            />
          </TabsContent>

          <TabsContent className='mt-4' value='options'>
            <OptionsTable
              onDelete={handleDeleteOption}
              onEdit={handleEditOption}
              options={options}
            />
          </TabsContent>
        </Tabs>
      </div>

      <PresetEditorDialog
        allOptions={options}
        onOpenChange={(open) => {
          setPresetDialogOpen(open);
          if (!open) setEditingPreset(null);
        }}
        onSave={handleSavePreset}
        open={presetDialogOpen}
        preset={editingPreset}
      />

      <OptionEditorDialog
        onOpenChange={(open) => {
          setOptionDialogOpen(open);
          if (!open) setEditingOption(null);
        }}
        onSave={handleSaveOption}
        open={optionDialogOpen}
        option={editingOption}
      />

      <ApplyPreviewDialog
        currentConfig={currentConfig}
        onApply={handleConfirmApply}
        onOpenChange={setApplyDialogOpen}
        open={applyDialogOpen}
        options={options}
        preset={applyingPreset}
      />

      <ImportPresetDialog
        onImport={handleImportPreset}
        onOpenChange={setImportDialogOpen}
        open={importDialogOpen}
      />
    </div>
  );
};

export default GamePresets;
