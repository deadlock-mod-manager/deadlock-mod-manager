import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useReinstallAction } from "@/hooks/use-reinstall-action";
import type { LocalMod } from "@/types/mods";

type ReinstallModButtonProps = {
  mod: LocalMod;
  variant?: "icon" | "default";
};

export const ReinstallModButton = ({
  mod,
  variant = "icon",
}: ReinstallModButtonProps) => {
  const { t } = useTranslation();
  const { reinstall, isReinstalling, isBusy, label } = useReinstallAction(mod);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={t("reinstall.action")}
          disabled={isBusy}
          icon={<ArrowClockwiseIcon className='h-4 w-4' />}
          isLoading={isReinstalling}
          onClick={(event) => {
            event.stopPropagation();
            reinstall();
          }}
          size={variant === "icon" ? "icon" : "default"}
          variant='outline'>
          {variant === "icon" ? null : label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
};
