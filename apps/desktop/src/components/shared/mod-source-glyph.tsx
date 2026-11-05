import { Globe } from "@deadlock-mods/ui/icons";
import { useState } from "react";
import { isNativeSourceImage } from "@/lib/mod-sources";

// A custom source's declared icon, falling back to a globe when it is missing,
// not an allowed image, or fails to load.
export const ModSourceGlyph = ({ iconUrl }: { iconUrl?: string | null }) => {
  const [failedIcon, setFailedIcon] = useState<string>();
  if (iconUrl && isNativeSourceImage(iconUrl) && failedIcon !== iconUrl) {
    return (
      <img
        className='size-4 shrink-0 object-contain'
        src={iconUrl}
        alt=''
        referrerPolicy='no-referrer'
        onError={() => setFailedIcon(iconUrl)}
      />
    );
  }
  return <Globe className='size-4 shrink-0' />;
};
