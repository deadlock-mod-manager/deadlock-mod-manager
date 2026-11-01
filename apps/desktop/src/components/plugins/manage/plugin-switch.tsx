import { Switch } from "@deadlock-mods/ui/components/switch";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/** 36x20 switch: cream when on, a grey knob on #262626 when off. */
export const PluginSwitch = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Switch>) => (
  <Switch
    className={cn(
      "relative h-[20px] w-[36px] shadow-none disabled:opacity-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#262626] *:shadow-none *:data-[state=unchecked]:bg-[#A3A3A3]",
      className,
    )}
    {...props}
  />
);
