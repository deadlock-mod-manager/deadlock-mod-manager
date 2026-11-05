import { usePreviewVisibility } from "@/hooks/use-preview-visibility";
import type { LocalMod } from "@/types/mods";
import { VisibleLocalModThumbnail } from "./visible-local-mod-thumbnail";

export const LocalModThumbnail = ({ mod }: { mod: LocalMod }) => {
  const { ref, visible } = usePreviewVisibility();
  return (
    <div ref={ref} className='h-full w-full bg-secondary'>
      {visible && <VisibleLocalModThumbnail mod={mod} />}
    </div>
  );
};
