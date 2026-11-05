import { replaceEqualDeep } from "@tanstack/react-query";
import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";

const equal = <T>(before: T, after: T) =>
  replaceEqualDeep(before, after) === before;

function patchNamed<T extends { name: string }>(
  before: readonly T[],
  after: readonly T[],
  target: readonly T[],
  part: ModdingModelPart,
): T[] {
  const next = new Map(target.map((value) => [value.name, value]));
  for (const name of new Set(
    [...before, ...after].map((value) => value.name),
  )) {
    const previous = before.find((value) => value.name === name);
    const value = after.find((value) => value.name === name);
    if (equal(previous, value)) continue;
    if (!value) next.delete(name);
    else if (part.controls.some((control) => control.name === name))
      next.set(name, value);
  }
  return [...next.values()];
}

/** Apply only the edited values, preserving each other material's recipe and UV paint. */
export function applyModelMaterialChange(
  edits: ModdingModelPartEdit[],
  parts: readonly ModdingModelPart[],
  selected: ReadonlySet<string>,
  after: ModdingModelPartEdit,
): ModdingModelPartEdit[] {
  const before = edits.find((edit) => edit.material === after.material);
  if (!before) return edits;
  return edits.map((target) => {
    if (target.material === after.material) return after;
    const part = parts.find((part) => part.material === target.material);
    if (
      !part ||
      !selected.has(after.material) ||
      !selected.has(target.material)
    )
      return target;
    const recolor = equal(before.recolor, after.recolor)
      ? target.recolor
      : before.recolor && after.recolor && target.recolor
        ? {
            color:
              before.recolor.color === after.recolor.color
                ? target.recolor.color
                : after.recolor.color,
            saturation:
              before.recolor.saturation === after.recolor.saturation
                ? target.recolor.saturation
                : after.recolor.saturation,
            brightness:
              before.recolor.brightness === after.recolor.brightness
                ? target.recolor.brightness
                : after.recolor.brightness,
          }
        : after.recolor;
    let pattern = equal(before.pattern, after.pattern)
      ? target.pattern
      : before.pattern && after.pattern && target.pattern
        ? {
            style:
              before.pattern.style === after.pattern.style
                ? target.pattern.style
                : after.pattern.style,
            intensity:
              before.pattern.intensity === after.pattern.intensity
                ? target.pattern.intensity
                : after.pattern.intensity,
            phase:
              before.pattern.phase === after.pattern.phase
                ? target.pattern.phase
                : after.pattern.phase,
            scroll: equal(before.pattern.scroll, after.pattern.scroll)
              ? target.pattern.scroll
              : after.pattern.scroll,
          }
        : after.pattern;
    let parameters = patchNamed(
      before.parameters,
      after.parameters,
      target.parameters,
      part,
    );
    let expressions = patchNamed(
      before.expressions,
      after.expressions,
      target.expressions,
      part,
    );
    const changedParameters = after.parameters.filter(
      (p) =>
        part.controls.some((control) => control.name === p.name) &&
        !equal(
          before.parameters.find((value) => value.name === p.name),
          p,
        ),
    );
    const changedExpressions = after.expressions.filter(
      (p) =>
        part.controls.some((control) => control.name === p.name) &&
        !equal(
          before.expressions.find((value) => value.name === p.name),
          p,
        ),
    );
    parameters = parameters.filter(
      (p) => !changedExpressions.some((e) => e.name === p.name),
    );
    expressions = expressions.filter(
      (e) => !changedParameters.some((p) => p.name === e.name),
    );
    if (part.tintable && !equal(before.pattern, after.pattern) && pattern) {
      parameters = parameters.filter((p) => p.name !== "g_vAlbedoScrollSpeed1");
      expressions = expressions.filter(
        (e) => e.name !== "g_vAlbedoScrollSpeed1",
      );
    } else if (
      [...changedParameters, ...changedExpressions].some(
        (p) => p.name === "g_vAlbedoScrollSpeed1",
      )
    )
      pattern = null;
    return {
      ...target,
      hidden: before.hidden === after.hidden ? target.hidden : after.hidden,
      tint:
        part.tintable && before.tint !== after.tint ? after.tint : target.tint,
      recolor: part.tintable ? recolor : target.recolor,
      roughness:
        part.roughnessEditable && before.roughness !== after.roughness
          ? after.roughness
          : target.roughness,
      metalness:
        part.metalnessEditable && before.metalness !== after.metalness
          ? after.metalness
          : target.metalness,
      pattern: part.tintable ? pattern : target.pattern,
      parameters,
      expressions,
    };
  });
}

export function commonModelMaterialPart(
  active: ModdingModelPart,
  selected: readonly ModdingModelPart[],
): ModdingModelPart {
  return {
    ...active,
    tintable: selected.every((part) => part.tintable),
    roughnessEditable: selected.every((part) => part.roughnessEditable),
    metalnessEditable: selected.every((part) => part.metalnessEditable),
    attributes: active.attributes.filter((name) =>
      selected.every((part) => part.attributes.includes(name)),
    ),
    controls: active.controls.flatMap((control) => {
      const shared = selected.flatMap((part) =>
        part.controls.filter(
          (c) =>
            c.name === control.name &&
            c.kind === control.kind &&
            c.values.length === control.values.length,
        ),
      );
      if (shared.length !== selected.length) return [];
      const min = Math.max(...shared.map((c) => c.min));
      const max = Math.min(...shared.map((c) => c.max));
      return min <= max
        ? [
            {
              ...control,
              min,
              max,
              expression:
                shared.find((c) => c.expression !== null)?.expression ?? null,
            },
          ]
        : [];
    }),
  };
}
