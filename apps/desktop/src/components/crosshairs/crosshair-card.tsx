import type { CrosshairConfig } from "@deadlock-mods/crosshair/types";
import type { PublishedCrosshairDto } from "@deadlock-mods/shared";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@deadlock-mods/ui/components/avatar";
import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardContent } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  DownloadSimple,
  EyeIcon,
  Heart,
  PencilIcon,
} from "@phosphor-icons/react";
import { useHover } from "@uidotdev/usehooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "react-query";
import { toggleCrosshairLike } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { CrosshairCanvas } from "./crosshair/crosshair-canvas";
import { CrosshairPreviewDialog } from "./crosshair-preview-dialog";

export interface CrosshairCardProps {
  crosshair?: PublishedCrosshairDto;
  config?: CrosshairConfig;
  isActive?: boolean;
}

export const CrosshairCard = ({
  crosshair,
  config,
  isActive = false,
}: CrosshairCardProps) => {
  const { t } = useTranslation();
  const [ref, hovering] = useHover();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const queryClient = useQueryClient();
  const { setActiveCrosshair } = usePersistedStore();

  const crosshairConfig = crosshair?.config ?? config;
  if (!crosshairConfig) {
    return null;
  }

  const handleApply = () => {
    setActiveCrosshair(crosshairConfig);
    toast.success(t("crosshairs.form.applied"));
  };

  const handlePreview = () => {
    setPreviewOpen(true);
  };

  const handleLike = async (e: React.MouseEvent) => {
    if (!crosshair || isLiking) return;
    e.stopPropagation();

    setIsLiking(true);
    try {
      await toggleCrosshairLike(crosshair.id);
      await queryClient.invalidateQueries("crosshairs");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("crosshairs.form.publishError"),
      );
    } finally {
      setIsLiking(false);
    }
  };

  const displayTags = crosshair?.tags?.slice(0, 3) ?? [];
  const remainingTags = crosshair?.tags?.length ? crosshair.tags.length - 3 : 0;

  return (
    <Card className={`border ${isActive ? "border-2 border-primary" : ""}`}>
      <CardContent className='p-4 relative flex flex-col gap-3'>
        {isActive && (
          <Badge variant='default' className='absolute top-2 right-2 z-10'>
            {t("crosshairs.currentlyActive")}
          </Badge>
        )}
        <div ref={ref} className='relative'>
          {hovering && (
            <div className='absolute inset-0 bg-background/90 rounded-xl flex items-center justify-center transition-all duration-300 z-20'>
              <div className='flex flex-col gap-2'>
                <Button
                  variant='text'
                  icon={<EyeIcon className='h-4 w-4' />}
                  className='text-white hover:text-primary'
                  onClick={handlePreview}>
                  {t("crosshairs.preview")}
                </Button>
                <Button
                  variant='text'
                  icon={<PencilIcon className='h-4 w-4' />}
                  className='text-white hover:text-primary'
                  onClick={handleApply}>
                  {t("crosshairs.form.apply")}
                </Button>
              </div>
            </div>
          )}
          <CrosshairCanvas config={crosshairConfig} interactive={false} />
        </div>
        {crosshair && (
          <div className='space-y-2'>
            <div className='flex items-center justify-between'>
              <h3 className='font-semibold text-sm truncate'>
                {crosshair.name}
              </h3>
            </div>
            {crosshair.description && (
              <p className='text-xs text-muted-foreground line-clamp-2'>
                {crosshair.description}
              </p>
            )}
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
              <div className='flex items-center gap-1'>
                <Avatar className='h-4 w-4'>
                  <AvatarImage src={crosshair.userImage ?? undefined} />
                  <AvatarFallback>
                    {crosshair.userName?.[0]?.toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className='truncate max-w-[100px]'>
                  {crosshair.userName ?? "Unknown"}
                </span>
              </div>
            </div>
            <div className='flex items-center gap-3 text-xs'>
              <button
                onClick={handleLike}
                disabled={isLiking}
                className='flex items-center gap-1 hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer'>
                <Heart
                  className={`h-4 w-4 ${
                    crosshair.hasLiked ? "fill-red-500 text-red-500" : ""
                  }`}
                />
                <span>{crosshair.likes}</span>
              </button>
              <div className='flex items-center gap-1'>
                <DownloadSimple className='h-4 w-4' />
                <span>{crosshair.downloads}</span>
              </div>
            </div>
            {crosshair.heroes &&
              crosshair.heroes.length > 0 &&
              crosshair.heroes.some((h) => h !== "Default") && (
                <div className='flex flex-wrap gap-1'>
                  {crosshair.heroes
                    .filter((h) => h !== "Default")
                    .slice(0, 3)
                    .map((hero) => (
                      <Badge key={hero} variant='outline' className='text-xs'>
                        {hero}
                      </Badge>
                    ))}
                </div>
              )}
            {displayTags.length > 0 && (
              <div className='flex flex-wrap gap-1'>
                {displayTags.map((tag) => (
                  <Badge key={tag} variant='secondary' className='text-xs'>
                    {tag}
                  </Badge>
                ))}
                {remainingTags > 0 && (
                  <Badge variant='secondary' className='text-xs'>
                    +{remainingTags}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CrosshairPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        crosshair={crosshair}
        config={config}
      />
    </Card>
  );
};
