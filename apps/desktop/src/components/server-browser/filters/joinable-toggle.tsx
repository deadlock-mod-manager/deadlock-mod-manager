import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { LightningIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface JoinableToggleProps {
  isJoinable: boolean;
  onToggle: () => void;
}

const JoinableToggle = ({ isJoinable, onToggle }: JoinableToggleProps) => {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-pressed={isJoinable}
          className={cn(
            "group inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 transition-all",
            "text-xs font-medium",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isJoinable
              ? "border-primary/50 bg-primary/15 text-primary shadow-[inset_0_-1px_0_var(--color-primary)]"
              : "border-border/60 bg-background/40 text-foreground/80 hover:bg-background/80 hover:text-foreground",
          )}
          onClick={onToggle}
          type='button'>
          <LightningIcon
            className={cn(
              "size-3.5 transition-transform",
              isJoinable
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground",
            )}
            weight={isJoinable ? "fill" : "regular"}
          />
          <span>{t("servers.filters.joinable")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("servers.filters.joinableTooltip")}</TooltipContent>
    </Tooltip>
  );
};

export default JoinableToggle;
