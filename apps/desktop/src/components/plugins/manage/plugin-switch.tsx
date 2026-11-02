import { Switch } from "@deadlock-mods/ui/components/switch";
import { type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/** 36x20 switch: cream when on, a grey knob on the border colour when off. */
export const PluginSwitch = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Switch>) => (
  <Switch
    className={cn(
      "relative h-[20px] w-[36px] shadow-none disabled:opacity-100 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border *:shadow-none *:data-[state=unchecked]:bg-muted-foreground",
      className,
    )}
    {...props}
  />
);
