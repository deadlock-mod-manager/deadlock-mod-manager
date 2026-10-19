import { PackageIcon } from "@phosphor-icons/react";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

export const ModThumb = ({
  mod,
  className,
}: {
  mod: LocalMod;
  className?: string;
}) => {
  const cover = getModCoverImage(mod);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded bg-secondary",
        className,
      )}>
      {cover ? (
        <img alt='' className='size-full object-cover' src={cover} />
      ) : (
        <PackageIcon
          aria-hidden
          className='size-1/2 text-muted-foreground'
          weight='duotone'
        />
      )}
    </div>
  );
};
