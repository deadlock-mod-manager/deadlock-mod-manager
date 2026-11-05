import type { ModdingModelPart } from "@/types/generated/ModdingModelPart";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";

export const TOON_PARAMETERS = [
  { name: "F_UNLIT", values: [0] },
  { name: "F_USE_NPR_LIGHTING", values: [1] },
  { name: "F_DISABLE_NPR_OUTLINE", values: [1] },
  { name: "F_SELF_ILLUM", values: [1] },
  { name: "F_USE_STATUS_EFFECTS_PROXY", values: [1] },
  { name: "g_flSelfIllumScale1", values: [10] },
  { name: "g_vSelfIllumTint1", values: [1, 1, 1, 0] },
  { name: "g_flSelfIllumAlbedoFactor1", values: [1] },
  { name: "g_flSelfIllumFresnelMaskExponent", values: [0.001] },
  { name: "g_vAlbedoContrastSaturationBrightness1", values: [1, 1, 0.1, 0] },
  { name: "TextureNormal1", values: [128 / 255, 128 / 255, 1, 0] },
  { name: "TextureAmbientOcclusion1", values: [1] },
  { name: "TextureSelfIllumMask1", values: [1] },
  { name: "TextureRimLightMask1", values: [0] },
  {
    name: "TextureNprTramsissiveColor1",
    values: [43 / 255, 42 / 255, 42 / 255, 0],
  },
];
export function applyToonPreset(
  part: ModdingModelPart,
  edit: ModdingModelPartEdit,
): ModdingModelPartEdit {
  const parameters = TOON_PARAMETERS.filter((p) =>
    part.controls.some((c) => c.name === p.name && !c.expression),
  );
  const names = new Set(parameters.map((p) => p.name));
  return {
    ...edit,
    roughness: part.roughnessEditable ? 1 : edit.roughness,
    metalness: part.metalnessEditable ? 0 : edit.metalness,
    parameters: [
      ...edit.parameters.filter((p) => !names.has(p.name)),
      ...parameters,
    ],
    expressions: edit.expressions.filter((e) => !names.has(e.name)),
  };
}

export function applyReactivePreset(
  part: ModdingModelPart,
  edit: ModdingModelPartEdit,
  source: string,
): ModdingModelPartEdit {
  if (
    !["F_SELF_ILLUM", "g_flSelfIllumScale1"].every((name) =>
      part.controls.some((c) => c.name === name),
    )
  )
    return edit;
  return {
    ...edit,
    parameters: [
      ...edit.parameters.filter(
        (p) => p.name !== "F_SELF_ILLUM" && p.name !== "g_flSelfIllumScale1",
      ),
      { name: "F_SELF_ILLUM", values: [1] },
    ],
    expressions: [
      ...edit.expressions.filter((e) => e.name !== "g_flSelfIllumScale1"),
      { name: "g_flSelfIllumScale1", source },
    ],
  };
}
