import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Textarea } from "@/components/ui/textarea";
import type { Option, OptionType } from "@/types/game-presets";

type OptionEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: Option | null;
  onSave: (option: Option) => void;
};

export const OptionEditorDialog = ({
  open,
  onOpenChange,
  option,
  onSave,
}: OptionEditorDialogProps) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState(option?.label || "");
  const [varName, setVarName] = useState(option?.varName || "");
  const [valueType, setValueType] = useState<OptionType>(
    option?.valueType || "number",
  );
  const [min, setMin] = useState(option?.min?.toString() || "0");
  const [max, setMax] = useState(option?.max?.toString() || "100");
  const [stringAllowed, setStringAllowed] = useState(
    option?.stringAllowed?.join(", ") || "",
  );
  const [defaultValue, setDefaultValue] = useState(option?.defaultValue || "");
  const [help, setHelp] = useState(option?.help || "");

  const handleSave = () => {
    const newOption: Option = {
      id: option?.id || `opt-${Date.now()}`,
      key: option?.key || `opt-${Date.now()}`,
      label,
      varName,
      valueType,
      defaultValue,
      help: help || undefined,
    };

    if (valueType === "number") {
      newOption.min = Number.parseFloat(min);
      newOption.max = Number.parseFloat(max);
    } else {
      newOption.stringAllowed = stringAllowed
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    }

    onSave(newOption);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {option ? t("gamePresets.editOption") : t("gamePresets.newOption")}
          </DialogTitle>
          <DialogDescription>
            {t("gamePresets.optionEditorDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label htmlFor='option-label'>{t("gamePresets.label")}</Label>
              <Input
                id='option-label'
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("gamePresets.optionLabelPlaceholder")}
                value={label}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='option-varname'>{t("gamePresets.varName")}</Label>
              <Input
                className='font-mono text-sm'
                id='option-varname'
                onChange={(e) => setVarName(e.target.value)}
                placeholder='cl_example_var'
                value={varName}
              />
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='option-type'>{t("gamePresets.type")}</Label>
            <Select
              onValueChange={(value: OptionType) => setValueType(value)}
              value={valueType}>
              <SelectTrigger id='option-type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='number'>
                  {t("gamePresets.typeNumber")}
                </SelectItem>
                <SelectItem value='string'>
                  {t("gamePresets.typeString")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {valueType === "number" ? (
            <div className='grid grid-cols-3 gap-4'>
              <div className='space-y-2'>
                <Label htmlFor='option-min'>{t("gamePresets.min")}</Label>
                <Input
                  id='option-min'
                  onChange={(e) => setMin(e.target.value)}
                  type='number'
                  value={min}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='option-max'>{t("gamePresets.max")}</Label>
                <Input
                  id='option-max'
                  onChange={(e) => setMax(e.target.value)}
                  type='number'
                  value={max}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='option-default'>
                  {t("gamePresets.default")}
                </Label>
                <Input
                  id='option-default'
                  onChange={(e) => setDefaultValue(e.target.value)}
                  type='number'
                  value={defaultValue}
                />
              </div>
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='option-allowed'>
                {t("gamePresets.allowedValues")}
              </Label>
              <Input
                id='option-allowed'
                onChange={(e) => setStringAllowed(e.target.value)}
                placeholder='0, 1, 2'
                value={stringAllowed}
              />
              <p className='text-muted-foreground text-xs'>
                {t("gamePresets.allowedValuesHelp")}
              </p>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='option-help'>{t("gamePresets.help")}</Label>
            <Textarea
              id='option-help'
              onChange={(e) => setHelp(e.target.value)}
              placeholder={t("gamePresets.helpPlaceholder")}
              rows={2}
              value={help}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant='outline'>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!label.trim() || !varName.trim()}
            onClick={handleSave}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

