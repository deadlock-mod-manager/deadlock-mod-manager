import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { EyeOff, MoreHorizontal, Trash2 } from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

interface HeroModActionsMenuProps {
  hero: string;
  disabled: boolean;
  /** Takes it off this hero's list without touching the download. */
  onRemove: () => void;
  onDelete: () => void;
  variant: "secondary" | "ghost";
}

export const HeroModActionsMenu = ({
  hero,
  disabled,
  onRemove,
  onDelete,
  variant,
}: HeroModActionsMenuProps) => {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("skins.modActions")}
              className='h-7 w-7 data-[state=open]:opacity-100'
              disabled={disabled}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              size='icon'
              variant={variant}>
              <MoreHorizontal className='h-3.5 w-3.5' />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("skins.modActions")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align='end' onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onRemove}>
          <EyeOff className='h-4 w-4' />
          {t("skins.removeFromHero", { hero })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='text-destructive focus:bg-destructive/10 focus:text-destructive'
          onSelect={onDelete}>
          <Trash2 className='h-4 w-4' />
          {t("skins.deleteMod")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
