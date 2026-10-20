import type { StateCreator } from "zustand";
import type { LocalMod } from "@/types/mods";
import type { ModGroup, ModProfile, ProfileId } from "@/types/profiles";

export const EMPTY_MOD_GROUPS: ModGroup[] = [];
export const MOD_GROUP_NAME_LIMIT = 80;

type ModGroupMove = {
  profileId: ProfileId;
  targetId: string | null;
  previous: { modId: string; groupId: string | null }[];
};

export type ModGroupsState = {
  createModGroup: (profileId: ProfileId, name: string) => string | null;
  renameModGroup: (
    profileId: ProfileId,
    groupId: string,
    name: string,
  ) => boolean;
  deleteModGroup: (profileId: ProfileId, groupId: string) => void;
  toggleModGroup: (profileId: ProfileId, groupId: string) => void;
  setModGroupsCollapsed: (
    profileId: ProfileId,
    collapsed: boolean,
    groupId?: string,
  ) => void;
  reorderModGroup: (
    profileId: ProfileId,
    groupId: string,
    targetId: string,
  ) => void;
  copyModGroups: (sourceId: ProfileId, targetId: ProfileId) => boolean;
  undoModGroupMove: (move: ModGroupMove) => void;
  moveModGroup: (
    profileId: ProfileId,
    groupId: string,
    direction: -1 | 1,
  ) => void;
  assignModsToGroup: (
    profileId: ProfileId,
    modIds: readonly string[],
    groupId: string | null,
  ) => ModGroupMove | null;
};

type ModGroupsStore = ModGroupsState & {
  profiles: Record<ProfileId, ModProfile>;
  activeProfileId: ProfileId;
  localMods: LocalMod[];
};

export const isModGroupNameAvailable = (
  groups: readonly ModGroup[],
  name: string,
  exceptId?: string,
) => {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MOD_GROUP_NAME_LIMIT &&
    !groups.some(
      (group) =>
        group.id !== exceptId &&
        group.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    )
  );
};

export const createModGroupsSlice: StateCreator<
  ModGroupsStore,
  [],
  [],
  ModGroupsState
> = (set, get) => {
  const updateGroups = (
    profileId: ProfileId,
    update: (groups: ModGroup[]) => ModGroup[],
  ) => {
    set((state) => {
      const profile = state.profiles[profileId];
      if (!profile) return state;
      return {
        profiles: {
          ...state.profiles,
          [profileId]: {
            ...profile,
            modGroups: update(profile.modGroups ?? EMPTY_MOD_GROUPS),
          },
        },
      };
    });
  };

  return {
    createModGroup: (profileId, name) => {
      const profile = get().profiles[profileId];
      if (!profile || !isModGroupNameAvailable(profile.modGroups ?? [], name)) {
        return null;
      }
      const id = crypto.randomUUID();
      updateGroups(profileId, (groups) => [
        ...groups,
        {
          id,
          name: name.trim(),
          modIds: [],
          collapsed: false,
        },
      ]);
      return id;
    },
    renameModGroup: (profileId, groupId, name) => {
      const groups = get().profiles[profileId]?.modGroups ?? [];
      if (
        !groups.some((group) => group.id === groupId) ||
        !isModGroupNameAvailable(groups, name, groupId)
      ) {
        return false;
      }
      updateGroups(profileId, (current) =>
        current.map((group) =>
          group.id === groupId ? { ...group, name: name.trim() } : group,
        ),
      );
      return true;
    },
    deleteModGroup: (profileId, groupId) =>
      updateGroups(profileId, (groups) =>
        groups.filter((group) => group.id !== groupId),
      ),
    toggleModGroup: (profileId, groupId) =>
      updateGroups(profileId, (groups) =>
        groups.map((group) =>
          group.id === groupId
            ? { ...group, collapsed: !group.collapsed }
            : group,
        ),
      ),
    setModGroupsCollapsed: (profileId, collapsed, groupId) =>
      updateGroups(profileId, (groups) =>
        groups.map((group) =>
          groupId === undefined || group.id === groupId
            ? { ...group, collapsed }
            : group,
        ),
      ),
    reorderModGroup: (profileId, groupId, targetId) =>
      updateGroups(profileId, (groups) => {
        const from = groups.findIndex((group) => group.id === groupId);
        const to = groups.findIndex((group) => group.id === targetId);
        if (from < 0 || to < 0 || from === to) return groups;
        const next = [...groups];
        const [group] = next.splice(from, 1);
        next.splice(to, 0, group);
        return next;
      }),
    copyModGroups: (sourceId, targetId) => {
      const state = get();
      const source = state.profiles[sourceId];
      const target = state.profiles[targetId];
      if (!source || !target || sourceId === targetId) return false;
      const targetMods =
        targetId === state.activeProfileId ? state.localMods : target.mods;
      const available = new Set(targetMods.map((mod) => mod.remoteId));
      updateGroups(targetId, () =>
        (source.modGroups ?? []).map((group) => ({
          id: crypto.randomUUID(),
          name: group.name,
          collapsed: group.collapsed,
          modIds: group.modIds.filter((id) => available.has(id)),
        })),
      );
      return true;
    },
    undoModGroupMove: ({ profileId, targetId, previous }) => {
      const state = get();
      const profile = state.profiles[profileId];
      if (!profile) return;
      const groups = profile.modGroups ?? [];
      const mods =
        profileId === state.activeProfileId ? state.localMods : profile.mods;
      const available = new Set(mods.map((mod) => mod.remoteId));
      const restoring = new Map(
        previous
          .filter(
            ({ modId }) =>
              available.has(modId) &&
              (groups.find((group) => group.modIds.includes(modId))?.id ??
                null) === targetId,
          )
          .map(({ modId, groupId }) => [modId, groupId]),
      );
      updateGroups(profileId, (current) =>
        current.map((group) => ({
          ...group,
          modIds: [
            ...group.modIds.filter((id) => !restoring.has(id)),
            ...[...restoring]
              .filter(([, id]) => id === group.id)
              .map(([id]) => id),
          ],
        })),
      );
    },
    moveModGroup: (profileId, groupId, direction) =>
      updateGroups(profileId, (groups) => {
        const index = groups.findIndex((group) => group.id === groupId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= groups.length) return groups;
        const next = [...groups];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    assignModsToGroup: (profileId, modIds, groupId) => {
      const state = get();
      const profile = state.profiles[profileId];
      if (
        !profile ||
        (groupId !== null &&
          !profile.modGroups?.some((group) => group.id === groupId))
      ) {
        return null;
      }
      const mods =
        profileId === state.activeProfileId ? state.localMods : profile.mods;
      const availableIds = new Set(mods.map((mod) => mod.remoteId));
      const selectedIds = new Set(modIds.filter((id) => availableIds.has(id)));
      const previous = [...selectedIds]
        .map((modId) => ({
          modId,
          groupId:
            profile.modGroups?.find((group) => group.modIds.includes(modId))
              ?.id ?? null,
        }))
        .filter((membership) => membership.groupId !== groupId);
      if (previous.length === 0) return null;
      updateGroups(profileId, (groups) =>
        groups.map((group) => ({
          ...group,
          modIds:
            group.id === groupId
              ? [...new Set([...group.modIds, ...selectedIds])]
              : group.modIds.filter((id) => !selectedIds.has(id)),
        })),
      );
      return { profileId, targetId: groupId, previous };
    },
  };
};
