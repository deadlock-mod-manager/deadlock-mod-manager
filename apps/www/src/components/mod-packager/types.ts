import type { ModConfig } from "@deadlock-mods/dmodpkg";
import type { UseFormReturn } from "react-hook-form";

export type ModConfigFormValues = Partial<ModConfig>;

export interface WizardStepProps {
  form: UseFormReturn<ModConfigFormValues>;
  zipFiles: string[];
  onNext: () => void;
  onBack: () => void;
  isFirst: boolean;
  isLast: boolean;
}
