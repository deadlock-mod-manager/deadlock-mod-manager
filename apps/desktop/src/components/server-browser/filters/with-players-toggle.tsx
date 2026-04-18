import { Toggle } from "@deadlock-mods/ui/components/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { UsersThreeIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface WithPlayersToggleProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

const WithPlayersToggle = ({
  pressed,
  onPressedChange,
}: WithPlayersToggleProps) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          aria-label={t("servers.filters.withPlayers")}
          className={cn(
            "h-9 gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5",
            "text-xs font-medium text-muted-foreground",
            "hover:bg-background/80 hover:text-foreground",
            "data-[state=on]:border-primary/50 data-[state=on]:bg-primary/15",
            "data-[state=on]:text-primary data-[state=on]:shadow-[inset_0_-1px_0_var(--color-primary)]",
          )}
          onPressedChange={onPressedChange}
          pressed={pressed}>
          <UsersThreeIcon
            className='size-3.5'
            weight={pressed ? "fill" : "duotone"}
          />
          <span>{t("servers.filters.withPlayers")}</span>
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{t("servers.filters.withPlayersOff")}</TooltipContent>
    </Tooltip>
  );
};

export default WithPlayersToggle;
