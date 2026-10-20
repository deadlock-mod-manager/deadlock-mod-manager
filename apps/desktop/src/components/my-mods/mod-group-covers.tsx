import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { shouldBlurNSFWItem } from "@/lib/mods/nsfw-visibility";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ModGroup } from "@/types/profiles";

const MAX_COVERS = 3;

export const ModGroupCovers = ({ group }: { group: ModGroup }) => {
  const mods = usePersistedStore((state) => state.localMods);
  const overrides = usePersistedStore((state) => state.perItemNSFWOverrides);
  const rememberOverrides = usePersistedStore(
    (state) => state.nsfwSettings.rememberPerItemOverrides,
  );
  const ids = new Set(group.modIds);
  const covers = mods.flatMap((mod) => {
    const src = ids.has(mod.remoteId) ? getModCoverImage(mod) : undefined;
    return src ? [{ mod, src }] : [];
  });
  if (covers.length === 0) return null;
  return (
    <span className='flex shrink-0 -space-x-2' aria-hidden>
      {covers.slice(0, MAX_COVERS).map(({ mod, src }, index) => (
        <img
          key={mod.remoteId}
          alt=''
          src={src}
          decoding='async'
          loading='lazy'
          style={{ transitionDelay: `${index * 60}ms` }}
          className={cn(
            "size-6 rounded-sm object-cover ring-2 ring-background transition-[filter,opacity] duration-300 ease-out motion-reduce:transition-none",
            !isInstalledModWithVpks(mod) && "opacity-70 grayscale",
            shouldBlurNSFWItem({
              isNSFW: mod.isNSFW,
              isVisibleOverride: overrides[mod.remoteId],
              rememberOverrides,
            }) && "blur-[3px]",
          )}
        />
      ))}
      {covers.length > MAX_COVERS && (
        <span className='flex size-6 items-center justify-center rounded-sm bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background'>
          +{covers.length - MAX_COVERS}
        </span>
      )}
    </span>
  );
};
