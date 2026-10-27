import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingHierarchy } from "@/types/generated/ModdingHierarchy";
import { AssetPreview } from "./asset-preview";
interface Props {
  addon: ModdingAddon;
  path: string;
  hierarchy: ModdingHierarchy;
  revision: number;
  archive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}
export function AddonPreview({
  addon,
  path,
  hierarchy,
  revision,
  archive = false,
  onDirtyChange,
  onSaved,
}: Props) {
  return (
    <AssetPreview
      key={`${addon.id}:${hierarchy}:${path}`}
      location={
        archive
          ? { kind: "archive", archivePath: addon.archivePath }
          : { kind: "addon", addon, hierarchy }
      }
      path={path}
      revision={revision}
      onDirtyChange={onDirtyChange}
      onSaved={onSaved}
    />
  );
}
