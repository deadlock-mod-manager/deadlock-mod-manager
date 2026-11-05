import { expect, test } from "bun:test";
import * as THREE from "three";
import { installModelMaterialEdits } from "./model-material-edits";
import { installModelImageSurfacePreview } from "@/lib/model-image-surface-preview";
import {
  installSource2Emission,
  updateSource2Emission,
} from "./source2-emission";

test("painted and projected colors drive glow through the original scalar mask", () => {
  const mask = new THREE.Texture();
  const originalGlow = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    emissiveMap: originalGlow,
  });
  material.userData.sourceMaterial = "head.vmat";
  expect(
    installSource2Emission(material, new Map([[4, mask]]), {
      maskTexture: 4,
      albedoFactor: 1,
    }),
  ).toBe(true);
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
  const edits = installModelMaterialEdits(root);
  const draft = installModelImageSurfacePreview(root);
  const shader = {
    uniforms: {
      uSource2EmissionAlbedo: { value: 0 },
      uSource2EmissionMask: { value: mask },
    },
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  // oxlint-disable-next-line anti-slop/no-reflect-apply
  Reflect.apply(material.onBeforeCompile, material, [shader]);
  expect(shader.fragmentShader).toContain(
    "texture2D(uSource2EmissionMask, vEmissiveMapUv).r",
  );
  expect(shader.fragmentShader).toContain(
    "mix(vec3(1.0), diffuseColor.rgb, uSource2EmissionAlbedo)",
  );
  expect(shader.fragmentShader.indexOf("vec2 imagePoint")).toBeLessThan(
    shader.fragmentShader.indexOf(
      "totalEmissiveRadiance *= texture2D(uSource2EmissionMask",
    ),
  );
  expect(shader.fragmentShader).not.toContain(
    "#include <emissivemap_fragment>",
  );
  expect(material.emissiveMap).toBe(originalGlow);
  expect(shader.uniforms.uSource2EmissionMask.value).toBe(mask);
  expect(shader.uniforms.uSource2EmissionAlbedo.value).toBe(1);
  updateSource2Emission(
    material,
    new Map([["g_flSelfIllumAlbedoFactor1", [0.4]]]),
  );
  expect(shader.uniforms.uSource2EmissionAlbedo.value).toBe(0.4);
  updateSource2Emission(material, new Map());
  expect(shader.uniforms.uSource2EmissionAlbedo.value).toBe(1);
  expect(material.emissiveMap).toBe(originalGlow);
  draft.dispose();
  edits.dispose();
  root.children.forEach((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  material.dispose();
  mask.dispose();
  originalGlow.dispose();
});
