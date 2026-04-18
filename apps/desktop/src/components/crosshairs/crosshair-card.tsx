import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  CheckIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";

export interface CrosshairCardProps {
  crosshair?: PublishedCrosshairDto;
  config?: CrosshairConfig;
  isActive?: boolean;
  onPreviewOpen?: () => void;
  onRemove?: () => void;
}

const SERIF_FONT = { fontFamily: '"Forevs Demo", serif' } as const;

export const CrosshairCard = ({
  crosshair,
  config,
  isActive = false,
  onPreviewOpen,
  onRemove,
}: CrosshairCardProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setActiveCrosshair } = usePersistedStore();
  const crosshairsEnabled = usePersistedStore(
    (state) => state.crosshairsEnabled,
  );

  const applyCrosshairMutation = useMutation({
    mutationFn: (crosshairConfig: CrosshairConfig) => {
      if (!crosshairsEnabled) {
        throw new Error("Custom crosshairs are disabled");
      }
      return invoke("apply_crosshair_to_autoexec", { config: crosshairConfig });
    },
    meta: {
      skipGlobalErrorHandler: true,
    },
    onSuccess: (_, crosshairConfig) => {
      setActiveCrosshair(crosshairConfig);
      toast.success(t("crosshairs.appliedRestart"));
      queryClient.invalidateQueries({ queryKey: ["autoexec-config"] });
    },
    onError: (error) => {
      logger.errorOnly(error);
      if (
        error instanceof Error &&
        error.message === "Custom crosshairs are disabled"
      ) {
        toast.error(t("crosshairs.disabledError"));
      } else {
        toast.error(t("crosshairs.form.applyError"));
      }
    },
  });

  const crosshairConfig = crosshair?.config ?? config;
  if (!crosshairConfig) {
    return null;
  }

  const handleApply = () => {
    applyCrosshairMutation.mutate(crosshairConfig);
  };

  const handlePreviewOpen = () => {
    onPreviewOpen?.();
  };

  const visibleHeroes =
    crosshair?.heroes?.filter((h) => h !== "Default").slice(0, 2) ?? [];
  const displayTags = crosshair?.tags?.slice(0, 2) ?? [];
  const remainingChips =
    (crosshair?.tags?.length ?? 0) +
    (crosshair?.heroes?.filter((h) => h !== "Default").length ?? 0) -
    visibleHeroes.length -
    displayTags.length;

  const isApplying = applyCrosshairMutation.isPending;
  const authorName = crosshair?.userName ?? "Unknown";

  return (
    <TooltipProvider delayDuration={150}>
      <Card
        className={cn(
          "group relative cursor-pointer overflow-hidden border-border/60 bg-card/60 backdrop-blur-sm",
          "transition-all duration-200 ease-out",
          "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80",
          "hover:shadow-lg hover:shadow-primary/5",
          isActive &&
            "border-primary/60 shadow-md shadow-primary/10 ring-1 ring-primary/30",
        )}
        onClick={handlePreviewOpen}>
        <CardContent className='relative flex flex-col p-0'>
          {isActive && (
            <>
              <CornerBracket className='top-1.5 left-1.5 border-t-2 border-l-2' />
              <CornerBracket className='top-1.5 right-1.5 border-t-2 border-r-2' />
              <CornerBracket className='bottom-1.5 left-1.5 border-b-2 border-l-2' />
              <CornerBracket className='bottom-1.5 right-1.5 border-b-2 border-r-2' />
            </>
          )}

          <div className='relative h-[200px] w-full overflow-hidden'>
            <div
              aria-hidden
              className={cn(
                "absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent",
                "transition-opacity duration-300",
                "opacity-60 group-hover:opacity-100",
              )}
            />
            <div className='absolute inset-0 flex items-center justify-center'>
              <CrosshairCanvas
                config={crosshairConfig}
                interactive={false}
                width={200}
                height={200}
              />
            </div>

            <div
              className={cn(
                "absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 p-2",
                "bg-gradient-to-t from-background/95 via-background/70 to-transparent",
                "translate-y-2 opacity-0 transition-all duration-200 ease-out",
                "group-hover:translate-y-0 group-hover:opacity-100",
              )}>
              <ActionIconButton
                icon={<EyeIcon className='h-4 w-4' weight='duotone' />}
                label={t("crosshairs.preview")}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreviewOpen();
                }}
              />
              <ActionIconButton
                icon={
                  isActive ? (
                    <CheckIcon className='h-4 w-4' weight='bold' />
                  ) : (
                    <PencilIcon className='h-4 w-4' weight='duotone' />
                  )
                }
                label={
                  isActive
                    ? t("crosshairs.currentlyActive")
                    : t("crosshairs.form.apply")
                }
                disabled={isApplying || isActive}
                isLoading={isApplying}
                onClick={(e) => {
                  e.stopPropagation();
                  handleApply();
                }}
                tone={isActive ? "active" : "primary"}
              />
              {onRemove && (
                <ActionIconButton
                  icon={<TrashIcon className='h-4 w-4' weight='duotone' />}
                  label={t("crosshairs.remove")}
                  tone='destructive'
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                />
              )}
            </div>

            {isActive && (
              <div className='absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/80 px-2 py-0.5 backdrop-blur-sm'>
                <span className='relative flex h-1.5 w-1.5'>
                  <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75' />
                  <span className='relative inline-flex h-1.5 w-1.5 rounded-full bg-primary' />
                </span>
                <span
                  className='font-bold text-[9px] text-primary uppercase tracking-[0.2em]'
                  style={SERIF_FONT}>
                  {t("crosshairs.currentlyActive")}
                </span>
              </div>
            )}
          </div>

          {crosshair && (
            <div className='flex flex-col gap-2 border-t border-border/40 px-3 py-3'>
              <div className='flex items-baseline justify-between gap-2'>
                <h3
                  className='truncate font-bold text-base leading-tight tracking-wide'
                  style={SERIF_FONT}
                  title={crosshair.name}>
                  {crosshair.name}
                </h3>
              </div>

              <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
                <span
                  className='font-bold text-[9px] uppercase tracking-[0.25em]'
                  style={SERIF_FONT}>
                  {t("mods.by")}
                </span>
                <span
                  className='truncate font-medium text-foreground/80'
                  title={authorName}>
                  {authorName}
                </span>
              </div>

              {(visibleHeroes.length > 0 ||
                displayTags.length > 0 ||
                remainingChips > 0) && (
                <div className='flex flex-wrap items-center gap-1 pt-0.5'>
                  {visibleHeroes.map((hero) => (
                    <Badge
                      key={`hero-${hero}`}
                      variant='outline'
                      className='h-5 border-primary/30 px-1.5 text-[10px] font-medium text-foreground/80'>
                      {hero}
                    </Badge>
                  ))}
                  {displayTags.map((tag) => (
                    <Badge
                      key={`tag-${tag}`}
                      variant='secondary'
                      className='h-5 px-1.5 text-[10px] font-medium'>
                      {tag}
                    </Badge>
                  ))}
                  {remainingChips > 0 && (
                    <Badge
                      variant='secondary'
                      className='h-5 px-1.5 text-[10px] font-medium text-muted-foreground'>
                      +{remainingChips}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

const CornerBracket = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "pointer-events-none absolute z-10 h-2.5 w-2.5 border-primary/70",
      className,
    )}
  />
);

type ActionTone = "default" | "primary" | "destructive" | "active";

interface ActionIconButtonProps {
  icon: React.ReactNode;
  label: string;
  tone?: ActionTone;
  disabled?: boolean;
  isLoading?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const ActionIconButton = ({
  icon,
  label,
  tone = "default",
  disabled,
  isLoading,
  onClick,
}: ActionIconButtonProps) => {
  const toneClass: Record<ActionTone, string> = {
    default: "text-foreground/80 hover:text-foreground hover:bg-muted",
    primary: "text-foreground/80 hover:text-primary hover:bg-primary/10",
    destructive:
      "text-foreground/80 hover:text-destructive hover:bg-destructive/10",
    active: "text-primary hover:text-primary",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          disabled={disabled}
          isLoading={isLoading}
          onClick={onClick}
          size='icon'
          variant='ghost'
          className={cn(
            "h-8 w-8 rounded-md border border-transparent transition-colors",
            "hover:border-border/60",
            toneClass[tone],
          )}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='top' className='text-xs'>
        {label}
      </TooltipContent>
    </Tooltip>
  );
};
