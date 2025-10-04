import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { Option, Preset } from "@/types/game-presets";
import { OptionPickerDialog } from "./option-picker-dialog";

type PresetEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: Preset | null;
  allOptions: Option[];
  onSave: (preset: Preset) => void;
};

export const PresetEditorDialog = ({
  open,
  onOpenChange,
  preset,
  allOptions,
  onSave,
}: PresetEditorDialogProps) => {
  const { t } = useTranslation();
  const [name, setName] = useState(preset?.name || "");
  const [description, setDescription] = useState(preset?.description || "");
  const [values, setValues] = useState<Record<string, string>>(
    preset?.values || {},
  );
  const [showOptionPicker, setShowOptionPicker] = useState(false);

  const handleSave = () => {
    onSave({
      id: preset?.id || `preset-${Date.now()}`,
      name,
      description,
      values,
    });
    onOpenChange(false);
  };

  const handleAddOptions = (optionIds: string[]) => {
    const newValues = { ...values };
    for (const optionId of optionIds) {
      const option = allOptions.find((opt) => opt.id === optionId);
      if (option && !newValues[optionId]) {
        newValues[optionId] = option.defaultValue || "";
      }
    }
    setValues(newValues);
    setShowOptionPicker(false);
  };

  const handleRemoveOption = (optionId: string) => {
    const newValues = { ...values };
    delete newValues[optionId];
    setValues(newValues);
  };

  const handleValueChange = (optionId: string, value: string) => {
    setValues({ ...values, [optionId]: value });
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className='max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {preset
                ? t("gamePresets.editPreset")
                : t("gamePresets.newPreset")}
            </DialogTitle>
            <DialogDescription>
              {t("gamePresets.presetEditorDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='preset-name'>{t("gamePresets.name")}</Label>
              <Input
                id='preset-name'
                onChange={(e) => setName(e.target.value)}
                placeholder={t("gamePresets.presetNamePlaceholder")}
                value={name}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='preset-description'>
                {t("gamePresets.description")}
              </Label>
              <Textarea
                id='preset-description'
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("gamePresets.presetDescriptionPlaceholder")}
                rows={2}
                value={description}
              />
            </div>
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label>{t("gamePresets.optionsInPreset")}</Label>
                <Button
                  onClick={() => setShowOptionPicker(true)}
                  size='sm'
                  variant='outline'>
                  <Plus className='mr-1 h-3 w-3' />
                  {t("gamePresets.addOption")}
                </Button>
              </div>
              <div className='max-h-96 space-y-3 overflow-auto rounded-md border p-4'>
                {Object.keys(values).length === 0 ? (
                  <p className='text-center text-muted-foreground text-sm'>
                    {t("gamePresets.noOptionsAdded")}
                  </p>
                ) : (
                  Object.keys(values).map((optionId) => {
                    const option = allOptions.find(
                      (opt) => opt.id === optionId,
                    );
                    if (!option) return null;
                    return (
                      <div
                        key={optionId}
                        className='flex items-center gap-4 rounded-md border bg-muted/50 p-3'>
                        <div className='flex-1 space-y-2'>
                          <div className='flex items-center justify-between'>
                            <Label className='font-medium'>
                              {option.label}
                            </Label>
                            <Badge
                              variant={
                                option.valueType === "number"
                                  ? "default"
                                  : "secondary"
                              }>
                              {option.valueType}
                            </Badge>
                          </div>
                          {option.valueType === "number" ? (
                            <div className='space-y-2'>
                              <div className='flex items-center gap-3'>
                                <Slider
                                  className='flex-1'
                                  max={option.max}
                                  min={option.min}
                                  onValueChange={(value) =>
                                    handleValueChange(
                                      optionId,
                                      value[0].toString(),
                                    )
                                  }
                                  step={(option.max! - option.min!) / 100}
                                  value={[
                                    Number.parseFloat(values[optionId] || "0"),
                                  ]}
                                />
                                <Input
                                  className='w-20 text-center'
                                  max={option.max}
                                  min={option.min}
                                  onChange={(e) =>
                                    handleValueChange(optionId, e.target.value)
                                  }
                                  type='number'
                                  value={values[optionId]}
                                />
                              </div>
                              <div className='flex justify-between text-muted-foreground text-xs'>
                                <span>{option.min}</span>
                                <span>{option.max}</span>
                              </div>
                            </div>
                          ) : (
                            <Select
                              onValueChange={(value) =>
                                handleValueChange(optionId, value)
                              }
                              value={values[optionId]}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {option.stringAllowed?.map((val) => (
                                  <SelectItem key={val} value={val}>
                                    {val}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <Button
                          aria-label='Remove option'
                          onClick={() => handleRemoveOption(optionId)}
                          size='sm'
                          variant='ghost'>
                          <Trash2 className='h-4 w-4' />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} variant='outline'>
              {t("common.cancel")}
            </Button>
            <Button disabled={!name.trim()} onClick={handleSave}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OptionPickerDialog
        allOptions={allOptions}
        onAdd={handleAddOptions}
        onOpenChange={setShowOptionPicker}
        open={showOptionPicker}
        selectedOptionIds={Object.keys(values)}
      />
    </>
  );
};

