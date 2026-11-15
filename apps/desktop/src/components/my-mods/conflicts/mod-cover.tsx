import { Package } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCoverImage } from "@/lib/mods/mod-images";
import type { LocalMod } from "@/types/mods";

/** A mod's cover, blurred when NSFW, or a package icon when it has none. */
export const ModCover = ({
  mod,
  className,
  style,
}: {
  mod: LocalMod | undefined;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const { shouldBlur } = useNSFWBlur(mod);
  const cover = mod && getModCoverImage(mod);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-secondary",
        className,
      )}
      style={style}>
      {cover ? (
        <img
          alt=''
          className={cn(
            "h-full w-full object-cover",
            shouldBlur && "blur-[3px]",
          )}
          decoding='async'
          src={cover}
        />
      ) : (
        <Package className='h-1/2 w-1/2 max-h-4 max-w-4 text-muted-foreground' />
      )}
    </div>
  );
};
