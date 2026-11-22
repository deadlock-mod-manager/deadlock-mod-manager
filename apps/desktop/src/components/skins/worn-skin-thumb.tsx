import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { getModCoverImage } from "@/lib/mods/mod-images";
import type { LocalMod } from "@/types/mods";

/** A chip-sized cover; left out when the cover would have to be blurred. */
export const WornSkinThumb = ({ mod }: { mod: LocalMod }) => {
  const { shouldBlur } = useNSFWBlur(mod);
  const coverImage = getModCoverImage(mod);

  if (!coverImage || shouldBlur) {
    return null;
  }

  return (
    <img
      alt=''
      className='h-[19px] w-[30px] shrink-0 rounded object-cover ring-1 ring-foreground/10'
      decoding='async'
      src={coverImage}
    />
  );
};
