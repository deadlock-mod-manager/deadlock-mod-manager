import type { EmbeddedVideo } from "@deadlock-mods/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { useTranslation } from "react-i18next";
import { VideoEmbed } from "@/components/shared/video-embed";

interface ModVideosProps {
  modName: string;
  videos: EmbeddedVideo[];
}

/** Videos the author embedded on the GameBanana submission page. */
export const ModVideos = ({ modName, videos }: ModVideosProps) => {
  const { t } = useTranslation();

  return (
    <Card className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle>{t("modDetail.videos")}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {videos.map((video, index) => (
          <VideoEmbed
            key={`${video.provider}:${video.id}`}
            title={t("modDetail.videoTitle", {
              name: modName,
              number: index + 1,
            })}
            video={video}
          />
        ))}
      </CardContent>
    </Card>
  );
};
