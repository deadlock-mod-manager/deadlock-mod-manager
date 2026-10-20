import type { ModGroup } from "@/types/profiles";

export const modGroupDropId = (groupId: string | null) =>
  groupId === null ? "library-ungrouped" : `library-group:${groupId}`;

export const modGroupHeaderId = (groupId: string) =>
  `library-group-header:${groupId}`;
export const modGroupDragId = (groupId: string) =>
  `library-group-drag:${groupId}`;
export const isModGroupDrag = (id: string | number) =>
  String(id).startsWith("library-group-drag:");

export const resolveModGroupDrop = (
  dropId: string | number,
  groups: readonly ModGroup[],
) => {
  if (dropId === modGroupDropId(null)) return null;
  return groups.find(
    (group) =>
      modGroupDropId(group.id) === dropId ||
      modGroupHeaderId(group.id) === dropId,
  )?.id;
};

export const groupLibraryMods = <T extends { remoteId: string }>(
  mods: readonly T[],
  groups: readonly ModGroup[],
) => {
  const memberships = new Map(
    groups.flatMap((group) =>
      group.modIds.map((id) => [id, group.id] satisfies [string, string]),
    ),
  );
  const sections = groups.map((group) => {
    const members: T[] = [];
    return { group, mods: members };
  });
  const byGroup = new Map(
    sections.map((section) => [section.group.id, section]),
  );
  const ungrouped: T[] = [];
  for (const mod of mods) {
    const groupId = memberships.get(mod.remoteId);
    const section = groupId ? byGroup.get(groupId) : undefined;
    if (section) section.mods.push(mod);
    else ungrouped.push(mod);
  }
  return { sections, ungrouped };
};
