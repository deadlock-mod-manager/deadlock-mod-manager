import { nativeComponentDownloads } from "@/lib/mods/native-update-selection";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";
import type { ModDownloadItem } from "@/types/mods";

export interface SelectionRow {
  id: string;
  label: string;
  /** What choosing the row downloads: the file itself, or a component's artifacts. */
  files: ModDownloadItem[];
}

interface SelectionSection {
  id: string;
  /** `null` for the flat file list, which gets a select-all header instead. */
  label: string | null;
  minSelections: number;
  maxSelections: number;
  rowIds: string[];
}

/** What the download dialog lists: plain files, or a source's declared components. */
export interface SelectionModel {
  rows: SelectionRow[];
  sections: SelectionSection[];
  /** Always selected and not toggleable. */
  lockedIds: string[];
  initialIds: string[];
}

export const REQUIRED_SECTION_ID = "required";

export const fileSelectionModel = (
  files: ModDownloadItem[],
): SelectionModel => ({
  rows: files.map((file) => ({
    id: file.name,
    label: file.name,
    files: [file],
  })),
  sections: [
    {
      id: "files",
      label: null,
      minSelections: 1,
      maxSelections: files.length,
      rowIds: files.map((file) => file.name),
    },
  ],
  lockedIds: [],
  initialIds: [],
});

export const componentSelectionModel = (
  installation: NativeSourceInstallation,
  files: ModDownloadItem[],
  selectedComponentIds?: string[],
): SelectionModel => {
  const known = (id: string) =>
    installation.components.some((component) => component.id === id);
  const ungroupedRequired = installation.requiredComponents.filter(
    (id) =>
      !installation.choiceGroups.some((group) =>
        group.componentIds.includes(id),
      ),
  );
  const sections: SelectionSection[] = installation.choiceGroups.map(
    (group) => ({
      id: group.id,
      label: group.label,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      rowIds: group.componentIds,
    }),
  );
  if (ungroupedRequired.length > 0)
    sections.push({
      id: REQUIRED_SECTION_ID,
      label: null,
      minSelections: ungroupedRequired.length,
      maxSelections: ungroupedRequired.length,
      rowIds: ungroupedRequired,
    });
  return {
    rows: installation.components.map((component) => ({
      id: component.id,
      label: component.label,
      files: nativeComponentDownloads(installation, [component.id], files),
    })),
    sections,
    lockedIds: installation.requiredComponents,
    initialIds: [
      ...installation.requiredComponents,
      ...(
        selectedComponentIds ??
        installation.choiceGroups.flatMap((group) => group.defaultComponentIds)
      ).filter(known),
    ],
  };
};

export const toggleSelection = (
  model: SelectionModel,
  selected: ReadonlySet<string>,
  id: string,
  checked: boolean,
): Set<string> => {
  const next = new Set(selected);
  if (model.lockedIds.includes(id)) return next;
  if (!checked) {
    next.delete(id);
    return next;
  }
  // A single-choice section behaves like a radio group.
  const section = model.sections.find((candidate) =>
    candidate.rowIds.includes(id),
  );
  if (section?.maxSelections === 1)
    for (const otherId of section.rowIds)
      if (!model.lockedIds.includes(otherId)) next.delete(otherId);
  next.add(id);
  return next;
};

export const isSelectionValid = (
  model: SelectionModel,
  selected: ReadonlySet<string>,
) =>
  selected.size > 0 &&
  model.sections.every((section) => {
    const count = section.rowIds.filter((id) => selected.has(id)).length;
    return count >= section.minSelections && count <= section.maxSelections;
  });

/** Components can share an archive, so each file counts once. */
export const selectedFiles = (
  model: SelectionModel,
  selected: ReadonlySet<string>,
): ModDownloadItem[] => {
  const files = new Map<string, ModDownloadItem>();
  for (const row of model.rows)
    if (selected.has(row.id))
      for (const file of row.files) files.set(file.url, file);
  return [...files.values()];
};
