import { buttonVariants } from "@deadlock-mods/ui/components/button";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { FolderOpenIcon } from "@phosphor-icons/react";

export const FolderButton = ({ label }: { label: string }) => (
  <span
    aria-disabled='true'
    className={cn(
      buttonVariants({ variant: "outline" }),
      "pointer-events-none opacity-60",
    )}>
    <FolderOpenIcon />
    {label}
  </span>
);
