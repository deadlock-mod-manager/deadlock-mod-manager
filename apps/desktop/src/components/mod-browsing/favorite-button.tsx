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

  const tooltipText = isFavorite ? t("favorites.remove") : t("favorites.add");

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
            "border border-white/10 bg-black/50 backdrop-blur-md",
            "transition-all duration-300 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "active:scale-90",
            isFavorite
              ? "shadow-[0_0_10px_rgba(234,179,8,0.3)] border-yellow-500/30"
              : "opacity-0 group-hover:opacity-100 hover:border-white/20 hover:bg-black/60",
            className,
          )}
          onClick={handleClick}
          type='button'>
          <Star
            className={cn(
              "h-4 w-4 transition-all duration-300",
              isFavorite
                ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]"
                : "text-white/70 hover:text-white",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
};

export default FavoriteButton;
