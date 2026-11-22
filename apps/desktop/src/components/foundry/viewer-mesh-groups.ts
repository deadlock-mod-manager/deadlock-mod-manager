import * as THREE from "three";
import { z } from "zod";

/** One choice of a body group, as the backend tags it on the glTF scene. */
const meshGroupChoice = z.object({
  bodyGroup: z.string(),
  name: z.string(),
  bit: z.number().int(),
});

const sceneMeshGroups = z.object({
  meshGroups: z.array(meshGroupChoice),
  defaultMeshGroups: z.array(z.number().int()),
});

const primitiveMeshGroups = z.object({
  meshGroups: z.array(z.number().int()),
});

interface BodyGroup {
  name: string;
  choices: { name: string; bit: number }[];
}

export interface MeshGroupTable {
  /** Body groups with more than one choice, in model order. */
  bodyGroups: BodyGroup[];
  /** The choice the game shows by default, per body group. */
  defaults: Record<string, number>;
}

/**
 * The model's switchable body groups, or null when it has none. Choices with
 * no meshes are left out: skins often keep the game's group table but drop
 * the alternates, and picking one would hide the whole model.
 */
export const readMeshGroups = (root: THREE.Object3D): MeshGroupTable | null => {
  const parsed = sceneMeshGroups.safeParse(root.userData);
  if (!parsed.success) return null;
  const drawn = new Set<number>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const groups = primitiveMeshGroups.safeParse(object.geometry.userData);
    if (groups.success)
      for (const bit of groups.data.meshGroups) drawn.add(bit);
  });
  const byName = new Map<string, BodyGroup>();
  for (const choice of parsed.data.meshGroups) {
    if (!drawn.has(choice.bit)) continue;
    const group = byName.get(choice.bodyGroup) ?? {
      name: choice.bodyGroup,
      choices: [],
    };
    group.choices.push({ name: choice.name, bit: choice.bit });
    byName.set(choice.bodyGroup, group);
  }
  const shown = new Set(parsed.data.defaultMeshGroups);
  const bodyGroups = [...byName.values()].filter(
    (group) => group.choices.length > 1,
  );
  if (bodyGroups.length === 0) return null;
  const defaults: Record<string, number> = {};
  for (const group of bodyGroups) {
    const choice =
      group.choices.find((candidate) => shown.has(candidate.bit)) ??
      group.choices[0];
    if (choice) defaults[group.name] = choice.bit;
  }
  return { bodyGroups, defaults };
};

/**
 * Shows the meshes of the chosen body-group choices and hides the other
 * choices'. Meshes outside every switchable group stay as they are.
 */
export const applyMeshGroups = (
  root: THREE.Object3D,
  table: MeshGroupTable,
  chosen: Record<string, number>,
) => {
  const switchable = new Set(
    table.bodyGroups.flatMap((group) =>
      group.choices.map((choice) => choice.bit),
    ),
  );
  const shown = new Set(Object.values(chosen));
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const parsed = primitiveMeshGroups.safeParse(object.geometry.userData);
    if (!parsed.success) return;
    const bits = parsed.data.meshGroups;
    if (!bits.some((bit) => switchable.has(bit))) return;
    object.visible = bits.some((bit) => shown.has(bit));
  });
};
