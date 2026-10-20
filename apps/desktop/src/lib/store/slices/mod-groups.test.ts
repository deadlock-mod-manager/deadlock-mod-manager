import { describe, expect, it } from "bun:test";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import { groupLibraryMods } from "@/lib/mods/library-groups";
import { placeholderModFromManifest } from "@/lib/store/utils/manifest-install-state";
import { createProfileId, type ModProfile } from "@/types/profiles";
import { createModGroupsSlice, type ModGroupsState } from "./mod-groups";

const firstId = createProfileId("first");
const secondId = createProfileId("second");
const modFor = (id: string, order: number) =>
  placeholderModFromManifest(
    id,
    {
      enabled: true,
      order,
      shard: 0,
      currentVpks: [`${id}_dir.vpk`],
      disabledVpks: [],
      originalVpkNames: [`${id}_dir.vpk`],
    },
    [`${id}_dir.vpk`],
  );
const mods = [modFor("silver", 3), modFor("map", 1), modFor("audio", 2)];
const profileFor = (id: ModProfile["id"]): ModProfile => ({
  id,
  name: id,
  createdAt: new Date(0),
  enabledMods: {
    silver: { remoteId: "silver", enabled: true, lastModified: new Date(0) },
  },
  isDefault: false,
  folderName: null,
  mods,
});
type TestState = ModGroupsState & {
  profiles: Record<ModProfile["id"], ModProfile>;
  activeProfileId: ModProfile["id"];
  localMods: typeof mods;
};

const createTestStore = (saved = new Map<string, string>()) =>
  createStore<TestState>()(
    persist(
      (...args) => ({
        profiles: {
          [firstId]: profileFor(firstId),
          [secondId]: profileFor(secondId),
        },
        activeProfileId: firstId,
        localMods: mods,
        ...createModGroupsSlice(...args),
      }),
      {
        name: "groups-test",
        storage: createJSONStorage(() => ({
          getItem: (key) => saved.get(key) ?? null,
          setItem: (key, value) => {
            saved.set(key, value);
          },
          removeItem: (key) => {
            saved.delete(key);
          },
        })),
      },
    ),
  );

const addGroup = (store: ReturnType<typeof createTestStore>, name: string) => {
  expect(store.getState().createModGroup(firstId, name)).not.toBeNull();
  const group = store.getState().profiles[firstId].modGroups?.at(-1);
  if (!group) throw new Error("Group was not created");
  return group.id;
};

describe("profile library groups", () => {
  it("organizes one profile without changing mod order, files, or enablement", () => {
    const store = createTestStore();
    const before = store.getState();
    const silver = addGroup(store, "Silver changes");
    const map = addGroup(store, "Map cosmetics");
    store.getState().assignModsToGroup(firstId, ["silver", "audio"], silver);
    store.getState().assignModsToGroup(firstId, ["map"], map);
    store.getState().moveModGroup(firstId, map, -1);
    store.getState().toggleModGroup(firstId, silver);
    const after = store.getState();
    expect(after.localMods).toBe(before.localMods);
    expect(after.profiles[firstId].mods).toBe(before.profiles[firstId].mods);
    expect(after.profiles[firstId].enabledMods).toBe(
      before.profiles[firstId].enabledMods,
    );
    expect(after.profiles[secondId]).toBe(before.profiles[secondId]);
    expect(after.profiles[firstId].modGroups?.map((group) => group.id)).toEqual(
      [map, silver],
    );
    const display = groupLibraryMods(
      after.localMods,
      after.profiles[firstId].modGroups ?? [],
    );
    expect(
      display.sections.flatMap((section) =>
        section.mods.map((mod) => mod.remoteId),
      ),
    ).toEqual(["map", "silver", "audio"]);
    expect(after.localMods.map((mod) => mod.installOrder)).toEqual([3, 1, 2]);
  });

  it("moves a selection between groups once, ignores absent mods, and supports Ungrouped", () => {
    const store = createTestStore();
    const first = addGroup(store, "First");
    const second = addGroup(store, "Second");
    store
      .getState()
      .assignModsToGroup(firstId, ["silver", "silver", "missing"], first);
    store.getState().assignModsToGroup(firstId, ["silver", "map"], second);
    expect(
      store
        .getState()
        .profiles[firstId].modGroups?.map((group) => group.modIds),
    ).toEqual([[], ["silver", "map"]]);
    store.getState().assignModsToGroup(firstId, ["silver"], null);
    expect(store.getState().profiles[firstId].modGroups?.[1].modIds).toEqual([
      "map",
    ]);
    store.getState().assignModsToGroup(firstId, ["map"], "deleted-group");
    expect(store.getState().profiles[firstId].modGroups?.[1].modIds).toEqual([
      "map",
    ]);
  });

  it("returns deleted group members to Ungrouped without removing mods", () => {
    const store = createTestStore();
    const groupId = addGroup(store, "Cosmetics");
    store.getState().assignModsToGroup(firstId, ["silver"], groupId);
    store.getState().deleteModGroup(firstId, groupId);
    expect(
      groupLibraryMods(
        store.getState().localMods,
        store.getState().profiles[firstId].modGroups ?? [],
      ).ungrouped,
    ).toEqual(mods);
    expect(store.getState().profiles[firstId].mods).toBe(mods);
  });

  it("validates names per profile and keeps stable IDs when renaming", () => {
    const store = createTestStore();
    const groupId = addGroup(store, "  Cosmetics  ");
    expect(store.getState().createModGroup(firstId, "cosmetics")).toBeNull();
    expect(store.getState().createModGroup(firstId, " ")).toBeNull();
    expect(store.getState().createModGroup(firstId, "x".repeat(81))).toBeNull();
    expect(
      store.getState().createModGroup(secondId, "Cosmetics"),
    ).not.toBeNull();
    expect(
      store.getState().renameModGroup(firstId, groupId, "Map cosmetics"),
    ).toBe(true);
    expect(store.getState().profiles[firstId].modGroups?.[0]).toMatchObject({
      id: groupId,
      name: "Map cosmetics",
    });
  });

  it("persists membership and collapsed state independently across profile switches", () => {
    const saved = new Map<string, string>();
    const store = createTestStore(saved);
    const groupId = addGroup(store, "Silver");
    store.getState().assignModsToGroup(firstId, ["silver"], groupId);
    store.getState().toggleModGroup(firstId, groupId);
    store.setState({ activeProfileId: secondId });
    store.getState().createModGroup(secondId, "Map");
    const reloaded = createTestStore(saved).getState();
    expect(reloaded.activeProfileId).toBe(secondId);
    expect(reloaded.profiles[firstId].modGroups?.[0]).toMatchObject({
      modIds: ["silver"],
      collapsed: true,
    });
    expect(reloaded.profiles[secondId].modGroups?.[0]).toMatchObject({
      name: "Map",
      modIds: [],
      collapsed: false,
    });
  });

  it("groups filtered results without restoring excluded mods or changing their sort within a group", () => {
    const store = createTestStore();
    const groupId = addGroup(store, "All");
    store
      .getState()
      .assignModsToGroup(firstId, ["silver", "audio", "map"], groupId);
    const groups = store.getState().profiles[firstId].modGroups ?? [];
    const filtered = [mods[2], mods[0]];
    expect(groupLibraryMods(filtered, groups).sections[0].mods).toEqual(
      filtered,
    );
    expect(groupLibraryMods([], groups).sections[0].mods).toEqual([]);
  });

  it("undoes a multi-group move without overwriting a later move or another profile", () => {
    const store = createTestStore();
    const first = addGroup(store, "First");
    const second = addGroup(store, "Second");
    store.getState().assignModsToGroup(firstId, ["silver"], first);
    const move = store
      .getState()
      .assignModsToGroup(firstId, ["silver", "map"], second);
    if (!move) throw new Error("Expected a move receipt");
    store.getState().assignModsToGroup(firstId, ["map"], first);
    store.setState({ activeProfileId: secondId });
    const other = store.getState().profiles[secondId];
    store.getState().undoModGroupMove(move);
    expect(
      store
        .getState()
        .profiles[firstId].modGroups?.map((group) => group.modIds),
    ).toEqual([["map", "silver"], []]);
    expect(store.getState().profiles[secondId]).toBe(other);
    expect(store.getState().localMods).toBe(mods);
  });

  it("copies matching membership with fresh IDs and independent collapse and order", () => {
    const store = createTestStore();
    const first = addGroup(store, "First");
    const second = addGroup(store, "Second");
    store.getState().assignModsToGroup(firstId, ["silver", "audio"], first);
    store.getState().setModGroupsCollapsed(firstId, true);
    store.getState().reorderModGroup(firstId, second, first);
    store.setState((state) => ({
      profiles: {
        ...state.profiles,
        [secondId]: { ...state.profiles[secondId], mods: [mods[0], mods[1]] },
      },
    }));
    const before = store.getState().profiles[secondId];
    expect(store.getState().copyModGroups(firstId, secondId)).toBe(true);
    const copied = store.getState().profiles[secondId];
    expect(
      copied.modGroups?.map((group) => [
        group.name,
        group.modIds,
        group.collapsed,
      ]),
    ).toEqual([
      ["Second", [], true],
      ["First", ["silver"], true],
    ]);
    expect(
      copied.modGroups?.some(
        (group) => group.id === first || group.id === second,
      ),
    ).toBe(false);
    expect(copied.mods).toBe(before.mods);
    expect(copied.enabledMods).toBe(before.enabledMods);
    store.getState().setModGroupsCollapsed(secondId, false);
    expect(
      store
        .getState()
        .profiles[firstId].modGroups?.every((group) => group.collapsed),
    ).toBe(true);
    expect(store.getState().copyModGroups(firstId, firstId)).toBe(false);
  });
});
