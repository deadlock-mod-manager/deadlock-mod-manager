import type { EmbeddedVideo } from "@deadlock-mods/shared";
import { PlayIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface VideoEmbedProps {
  video: EmbeddedVideo;
  title: string;
}

// Both players need scripts and their own origin; popups let "Watch on
// YouTube/Vimeo" open outside the sandbox.
const PLAYER_SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";
const PLAYER_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

function playerUrl({ provider, id, hash }: EmbeddedVideo): string {
  if (provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
  }
  const params = new URLSearchParams({ autoplay: "1", dnt: "1" });
  if (hash) params.set("h", hash);
  return `https://player.vimeo.com/video/${encodeURIComponent(id)}?${params}`;
}

const YouTubeThumbnail = ({ id, alt }: { id: string; alt: string }) => {
  // maxresdefault only exists for HD uploads; hqdefault is always generated
  const [quality, setQuality] = useState<"maxresdefault" | "hqdefault">(
    "maxresdefault",
  );
  return (
    <img
      alt={alt}
      className='size-full object-cover'
      onError={() => setQuality("hqdefault")}
      src={`https://img.youtube.com/vi/${encodeURIComponent(id)}/${quality}.jpg`}
    />
  );
};

/**
 * Click-to-play video player. The provider iframe loads only after the user
 * clicks, so viewing a page contacts YouTube for a thumbnail at most.
 */
export const VideoEmbed = ({ video, title }: VideoEmbedProps) => {
  const { t } = useTranslation();
  const [activated, setActivated] = useState(false);

  return (
    <div className='relative overflow-hidden rounded-lg border border-primary/15'>
      {activated ? (
        <div className='aspect-video'>
          <iframe
            allow={PLAYER_ALLOW}
            allowFullScreen
            className='size-full'
            sandbox={PLAYER_SANDBOX}
            src={playerUrl(video)}
            title={title}
          />
        </div>
      ) : (
        <button
          aria-label={t("videoEmbed.play", { title })}
          className='group relative block aspect-video w-full cursor-pointer bg-muted'
          onClick={() => setActivated(true)}
          type='button'>
          {video.provider === "youtube" && (
            <YouTubeThumbnail
              alt={t("videoEmbed.thumbnailAlt")}
              id={video.id}
            />
          )}
          <div className='absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/40' />
          {video.provider === "vimeo" && (
            <span className='absolute bottom-3 left-3 font-medium text-sm text-white/80'>
              Vimeo
            </span>
          )}
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='flex size-14 items-center justify-center rounded-full bg-primary/90 shadow-lg transition-transform group-hover:scale-110'>
              <PlayIcon
                className='ml-0.5 size-7 text-primary-foreground'
                weight='fill'
              />
            </div>
          </div>
        </button>
      )}
    </div>
  );
};
