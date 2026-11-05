export interface ModelMaterialSelection {
  materials: ReadonlySet<string>;
  active: string;
  anchor: string;
}

export function selectModelMaterial(
  current: ModelMaterialSelection,
  material: string,
  visible: readonly string[],
  modifiers: { toggle?: boolean; range?: boolean } = {},
): ModelMaterialSelection {
  if (modifiers.range) {
    const start = visible.indexOf(current.anchor);
    const end = visible.indexOf(material);
    if (start >= 0 && end >= 0) {
      const range = visible.slice(
        Math.min(start, end),
        Math.max(start, end) + 1,
      );
      return {
        materials: new Set(
          modifiers.toggle ? [...current.materials, ...range] : range,
        ),
        active: material,
        anchor: current.anchor,
      };
    }
  }
  const materials = new Set(modifiers.toggle ? current.materials : []);
  if (modifiers.toggle && materials.has(material)) materials.delete(material);
  else materials.add(material);
  return {
    materials,
    active: materials.has(material) ? material : ([...materials].at(-1) ?? ""),
    anchor: material,
  };
}
