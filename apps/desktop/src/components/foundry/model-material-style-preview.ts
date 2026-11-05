import * as THREE from "three";
import type { ModdingModelPartEdit } from "@/types/generated/ModdingModelPartEdit";
import {
  compileMaterialExpression,
  type MaterialExpressionInputs,
} from "./model-material-expression";
import { updateSource2Color } from "./source2-material";
import { PLAYGROUND_TOON_LIGHTING } from "./playground-toon-shader";
import { updateSource2Emission } from "./source2-emission";

export function installMaterialStylePreview(
  material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
) {
  const standard =
    material instanceof THREE.MeshStandardMaterial ? material : null;
  const base = standard
    ? {
        normalScale: standard.normalScale.clone(),
        aoMap: standard.aoMap,
        aoMapIntensity: standard.aoMapIntensity,
        emissive: standard.emissive.clone(),
        emissiveIntensity: standard.emissiveIntensity,
        emissiveMap: standard.emissiveMap,
      }
    : null;
  let settings = new Map<string, readonly number[]>();
  let expressions: {
    name: string;
    evaluate: NonNullable<ReturnType<typeof compileMaterialExpression>>;
  }[] = [];
  let active: ModdingModelPartEdit | undefined;
  const albedoContribution = { value: -1 };
  const nprEnabled = { value: 0 };
  if (standard) {
    const previous = standard.onBeforeCompile;
    const key = standard.customProgramCacheKey();
    standard.onBeforeCompile = (shader, renderer) => {
      previous.call(standard, shader, renderer);
      shader.uniforms.uModelSelfIllumAlbedo = albedoContribution;
      shader.uniforms.uModelNprEnabled = nprEnabled;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_pars_fragment>",
        `#include <lights_physical_pars_fragment>\n${PLAYGROUND_TOON_LIGHTING}`,
      );
      shader.fragmentShader = `uniform float uModelSelfIllumAlbedo;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `if (uModelSelfIllumAlbedo >= 0.0) {
  totalEmissiveRadiance *= mix(vec3(1.0), diffuseColor.rgb, uModelSelfIllumAlbedo);
} else {
  #include <emissivemap_fragment>
}`,
      );
    };
    standard.customProgramCacheKey = () => `${key}:model-style-v2`;
    standard.needsUpdate = true;
  }
  const apply = (values: ReadonlyMap<string, readonly number[]>) => {
    updateSource2Color(material, values);
    updateSource2Emission(material, values);
    nprEnabled.value =
      !material.transparent && material.blending === THREE.NormalBlending
        ? (values.get("F_USE_NPR_LIGHTING")?.[0] ?? 0)
        : 0;
    if (!standard || !base) return;
    const normal = values.get("TextureNormal1");
    standard.normalScale.copy(base.normalScale);
    if (
      normal &&
      Math.abs(normal[0] - 0.5) < 0.01 &&
      Math.abs(normal[1] - 0.5) < 0.01
    )
      standard.normalScale.set(0, 0);
    const ao = values.get("TextureAmbientOcclusion1")?.[0];
    const aoMap = ao !== undefined ? null : base.aoMap;
    if (standard.aoMap !== aoMap) {
      standard.aoMap = aoMap;
      standard.needsUpdate = true;
    }
    standard.aoMapIntensity = ao ?? base.aoMapIntensity;
    const enabled = values.get("F_SELF_ILLUM")?.[0];
    const albedo = values.get("g_flSelfIllumAlbedoFactor1")?.[0];
    albedoContribution.value =
      enabled === 1 && albedo !== undefined ? albedo : -1;
    if (enabled === 0) {
      standard.emissive.setRGB(0, 0, 0);
      standard.emissiveIntensity = 0;
    } else if (
      enabled === 1 ||
      values.has("g_flSelfIllumScale1") ||
      values.has("g_vSelfIllumTint1")
    ) {
      const tint = values.get("g_vSelfIllumTint1") ?? [1, 1, 1];
      standard.emissive.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
      standard.emissiveIntensity =
        (values.get("g_flSelfIllumScale1")?.[0] ?? base.emissiveIntensity) *
        (values.get("TextureSelfIllumMask1")?.[0] ?? 1);
    } else {
      standard.emissive.copy(base.emissive);
      standard.emissiveIntensity = base.emissiveIntensity;
    }
    standard.emissiveMap = base.emissiveMap;
  };
  return {
    set(edit: ModdingModelPartEdit | undefined) {
      active = edit;
      settings = new Map(edit?.parameters.map((p) => [p.name, p.values]) ?? []);
      expressions =
        edit?.expressions.flatMap((e) => {
          const evaluate = compileMaterialExpression(e.source);
          return evaluate ? [{ name: e.name, evaluate }] : [];
        }) ?? [];
      apply(settings);
    },
    tick(input: MaterialExpressionInputs) {
      const evaluated = expressions.length ? new Map(settings) : settings;
      for (const e of expressions) {
        const value = e.evaluate(input);
        if (value.every(Number.isFinite)) evaluated.set(e.name, value);
      }
      if (expressions.length) apply(evaluated);
      const scroll = evaluated.get("g_vAlbedoScrollSpeed1") ??
        active?.pattern?.scroll ?? [0, 0];
      return {
        scroll,
        active: expressions.length > 0 || scroll.some((v) => v !== 0),
      };
    },
  };
}
