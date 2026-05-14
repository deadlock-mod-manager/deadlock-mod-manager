import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Star } from "@deadlock-mods/ui/icons";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = {
  remoteId: string;
  variant?: "overlay" | "inline";
  className?: string;
};

const FavoriteButton = ({
  remoteId,
  variant = "overlay",
  className,
}: FavoriteButtonProps) => {
  const { t } = useTranslation();
  const isFavorite = usePersistedStore((state) =>
    state.favorites.includes(remoteId),
  );
  const toggleFavorite = usePersistedStore((state) => state.toggleFavorite);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(remoteId);
  };

  const tooltipText = isFavorite
    ? t("favorites.remove")
    : t("favorites.add");

  if (variant === "inline") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={tooltipText}
            aria-pressed={isFavorite}
            className={className}
            icon={
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  isFavorite && "fill-current text-yellow-400",
                )}
              />
            }
            onClick={handleClick}
            size='lg'
            variant='outline'>
            {isFavorite ? t("favorites.favorited") : t("favorites.favorite")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={tooltipText}
          aria-pressed={isFavorite}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-full",
            "bg-background/70 backdrop-blur-sm shadow-sm",
            "text-foreground/80 hover:text-yellow-400",
            "transition-colors hover:bg-background/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          onClick={handleClick}
          type='button'>
          <Star
            className={cn(
              "h-4 w-4 transition-all",
              isFavorite && "fill-yellow-400 text-yellow-400",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

export default FavoriteButton;
