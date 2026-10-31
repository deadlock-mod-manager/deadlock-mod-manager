import { Kbd } from "@deadlock-mods/ui/components/kbd";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { useId } from "react";
import { type ViewerOverlayToggle } from "./viewer-tool-types";

export const SwitchRow = ({
  icon: RowIcon,
  label,
  shortcut,
  checked,
  onCheckedChange,
}: Omit<ViewerOverlayToggle, "id">) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className='flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-xs transition-colors hover:bg-muted/60'>
      <RowIcon className='size-3.5 shrink-0 text-muted-foreground' />
      <span className='flex-1'>{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className='h-4 w-7 [&>span]:size-3 [&>span]:data-[state=checked]:translate-x-3'
      />
    </label>
  );
};
