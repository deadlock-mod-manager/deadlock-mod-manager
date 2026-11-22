import * as THREE from "three";
import { z } from "zod";

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
  bodyGroups: BodyGroup[];
  defaults: Record<string, number>;
}

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
