import { Button } from "@deadlock-mods/ui/components/button";
import { type HTMLProps, useContext } from "react";
import { cn } from "@/lib/utils";
import { Icons } from "./icons";
import TauriAppWindowContext from "./window-context";

export function Windows({ className, ...props }: HTMLProps<HTMLDivElement>) {
  const { isWindowMaximized, minimizeWindow, maximizeWindow, closeWindow } =
    useContext(TauriAppWindowContext);

  return (
    <div className={cn("h-8", className)} {...props}>
      <Button
        onClick={minimizeWindow}
        className='max-h-8 w-[46px]  [&_svg]:size-2.5 cursor-default rounded-none bg-transparent text-black/90 hover:bg-black/[.05] active:bg-black/[.03]  dark:text-white dark:hover:bg-white/[.06] dark:active:bg-white/[.04]'>
        <Icons.minimizeWin />
      </Button>
      <Button
        onClick={maximizeWindow}
        className={cn(
          "max-h-8 w-[46px]  [&_svg]:size-2.5 cursor-default rounded-none bg-transparent",
          "text-black/90 hover:bg-black/[.05] active:bg-black/[.03] dark:text-white dark:hover:bg-white/[.06] dark:active:bg-white/[.04]",
        )}>
        {!isWindowMaximized ? (
          <Icons.maximizeWin />
        ) : (
          <Icons.maximizeRestoreWin />
        )}
      </Button>
      <Button
        onClick={closeWindow}
        className='max-h-8 w-[46px]  [&_svg]:size-2.5 cursor-default rounded-none bg-transparent text-black/90 hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90 dark:text-white'>
        <Icons.closeWin />
      </Button>
    </div>
  );
}
