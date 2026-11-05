import { FileIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  assetSelectionState,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import { AssetImportCheckbox } from "./asset-import-checkbox";

interface Props {
  node: ModdingArchiveEntry;
  depth: number;
  selection: AssetSelection;
  selected: boolean;
  disabled: boolean;
  onPreview: (path: string) => void;
  onSelect: (node: ModdingArchiveEntry, selected: boolean) => void;
}

export const AssetImportTreeFile = ({
  node,
  depth,
  selection,
  selected,
  disabled,
  onPreview,
  onSelect,
}: Props) => {
  const { t } = useTranslation();
  return (
    <div role='treeitem' aria-selected={selected}>
      <div
        className={`flex items-center gap-1 pr-2 text-xs ${selected ? "bg-accent" : "hover:bg-accent/50"}`}
        style={{ paddingLeft: depth * 14 + 4 }}>
        <span className='size-6 shrink-0' aria-hidden />
        <AssetImportCheckbox
          label={t("workbenchExplorer.selectAsset", { path: node.path })}
          checked={assetSelectionState(selection, node)}
          disabled={disabled}
          onCheckedChange={(checked) => onSelect(node, checked)}
        />
        <button
          type='button'
          className='flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left'
          disabled={disabled}
          onClick={() => onPreview(node.path)}
          title={node.path}>
          <FileIcon className='size-4 shrink-0 text-muted-foreground' />
          <span className='truncate'>{node.name}</span>
        </button>
      </div>
    </div>
  );
};
