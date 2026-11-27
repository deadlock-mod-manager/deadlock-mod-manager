import { Kbd } from "@deadlock-mods/ui/components/kbd";
import { platform } from "@tauri-apps/plugin-os";
import { formatCombo, type KeyCombo as Combo } from "@/lib/keybinds";
import { cn } from "@/lib/utils";

type KeyComboProps = {
  combo: Combo;
  className?: string;
};

export const KeyCombo = ({ combo, className }: KeyComboProps) => (
  <span className={cn("inline-flex items-center gap-1", className)}>
    {formatCombo(combo, platform()).map((label) => (
      <Kbd key={label}>{label}</Kbd>
    ))}
  </span>
);
