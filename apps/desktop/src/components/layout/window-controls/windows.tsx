import { Button } from "@deadlock-mods/ui/components/button";
import { type HTMLProps, useContext } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Icons } from "./icons";
import TauriAppWindowContext from "./window-context";

const baseButton =
  "flex cursor-pointer items-center justify-center rounded-none " +
  "bg-transparent p-0 text-foreground/60 outline-none ring-0 " +
  "transition-colors duration-150 hover:bg-transparent focus-visible:ring-0 " +
  "[&_svg]:size-3.5";

export function Windows({
  className,
  ...props
}: Readonly<HTMLProps<HTMLDivElement>>) {
  const { t } = useTranslation();
  const { isWindowMaximized, minimizeWindow, maximizeWindow, closeWindow } =
    useContext(TauriAppWindowContext);

  return (
    <div className={cn("flex items-center gap-4 px-2", className)} {...props}>
      <Button
        variant='transparent'
        size='no-padding'
        onClick={minimizeWindow}
        aria-label={t("accessibility.minimize")}
        title={t("accessibility.minimize")}
        className={cn(baseButton, "hover:text-primary")}>
        <Icons.MinimizeWin />
      </Button>
      <Button
        variant='transparent'
        size='no-padding'
        onClick={maximizeWindow}
        aria-label={
          isWindowMaximized
            ? t("accessibility.restore")
            : t("accessibility.maximize")
        }
        title={
          isWindowMaximized
            ? t("accessibility.restore")
            : t("accessibility.maximize")
        }
        className={cn(baseButton, "hover:text-primary")}>
        {isWindowMaximized ? (
          <Icons.MaximizeRestoreWin />
        ) : (
          <Icons.MaximizeWin />
        )}
      </Button>
      <Button
        variant='transparent'
        size='no-padding'
        onClick={closeWindow}
        aria-label={t("accessibility.close")}
        title={t("accessibility.close")}
        className={cn(baseButton, "hover:text-primary")}>
        <Icons.CloseWin />
      </Button>
    </div>
  );
}
