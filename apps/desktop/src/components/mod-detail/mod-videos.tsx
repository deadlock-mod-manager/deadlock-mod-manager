import type { EmbeddedVideo, NSFWSettings } from "@deadlock-mods/shared";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Eye, EyeOff } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NSFWBlur } from "@/components/mod-browsing/nsfw-blur";
import { VideoEmbed } from "@/components/shared/video-embed";

interface ModVideosProps {
  modName: string;
  videos: EmbeddedVideo[];
  shouldBlur: boolean;
  nsfwSettings: NSFWSettings;
  onNSFWToggle: (visible: boolean) => void;
}

export const ModVideos = ({
  modName,
  videos,
  shouldBlur,
  nsfwSettings,
  onNSFWToggle,
}: ModVideosProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const hasBlurredVideos = shouldBlur && !nsfwSettings.disableBlur;
  const isBlurred = hasBlurredVideos && !visible;

  const toggleVisibility = () => {
    const nextVisible = !visible;
    setVisible(nextVisible);
    onNSFWToggle(nextVisible);
  };

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle>{t("modDetail.videos")}</CardTitle>
        {hasBlurredVideos && (
          <Button
            className='gap-1 text-xs'
            onClick={toggleVisibility}
            size='sm'
            variant='secondary'>
            {visible ? (
              <EyeOff className='h-3 w-3' />
            ) : (
              <Eye className='h-3 w-3' />
            )}
            {visible ? t("filters.hideNSFW") : t("filters.showNSFW")}
          </Button>
        )}
      </CardHeader>
      <CardContent className='grid gap-4'>
        {videos.map((video, index) => (
          <NSFWBlur
            key={`${video.provider}:${video.id}`}
            blurStrength={nsfwSettings.blurStrength}
            isNSFW={isBlurred}
            showControls={false}>
            <VideoEmbed
              key={isBlurred ? "hidden" : "visible"}
              disabled={isBlurred}
              title={t("modDetail.videoTitle", {
                name: modName,
                number: index + 1,
              })}
              video={video}
            />
          </NSFWBlur>
        ))}
      </CardContent>
    </Card>
  );
};
