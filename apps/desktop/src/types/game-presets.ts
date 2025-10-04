export type OptionType = "number" | "string";

export type Option = {
  id: string;
  key: string;
  varName: string;
  valueType: OptionType;
  min?: number;
  max?: number;
  stringAllowed?: string[];
  defaultValue?: string;
  label: string;
  help?: string;
};

export type Preset = {
  id: string;
  name: string;
  description?: string;
  values: Record<string, string>;
};

export type DiffLine = {
  key: string;
  oldValue?: string;
  newValue?: string;
  kind: "add" | "remove" | "change";
};

export type ImportStep = "upload" | "preview" | "confirm";

export type ExtractedConVar = {
  key: string;
  value: string;
};

