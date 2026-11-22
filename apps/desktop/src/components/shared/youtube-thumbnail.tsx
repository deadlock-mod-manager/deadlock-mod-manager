import { useState } from "react";

interface YouTubeThumbnailProps {
  id: string;
  alt: string;
}

export const YouTubeThumbnail = ({ id, alt }: YouTubeThumbnailProps) => {
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
