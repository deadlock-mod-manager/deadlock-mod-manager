import { expect, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";
import { createMaterialMotion } from "./material-motion";

const graph = (): FoundryParticleGraph => ({
  roots: [],
  ambientRoots: [],
  castRoots: [],
  releaseRoots: [],
  ability: null,
  abilityEffects: [],
  systems: {},
  attachments: {},
  textures: [],
  models: [],
  warnings: [],
  materials: {
    "materials/smoke.vmat": {
      m_vectorParams: [
        { m_name: "g_vAlbedoScrollSpeed1", m_value: [0.1, 0.3, 0, 0] },
      ],
    },
  },
});

test("scrolls only the authored material and restores the shared texture on disposal", () => {
  const assets = new ParticleAssets(graph(), []);
  const original = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: original });
  material.userData.sourceMaterial = "materials/smoke.vmat";
  const stationary = new THREE.MeshStandardMaterial({ map: original });
  const model = new THREE.Group();
  model.add(
    new THREE.Mesh(new THREE.BoxGeometry(), material),
    new THREE.Mesh(new THREE.BoxGeometry(), stationary),
  );
  const effect = createMaterialMotion(model, assets);
  effect.update(1.5);
  expect(material.map?.offset.x).toBeCloseTo(0.15);
  expect(material.map?.offset.y).toBeCloseTo(0.45);
  expect(stationary.map?.offset.toArray()).toEqual([0, 0]);
  effect.update(0);
  expect(material.map?.offset.x).toBeCloseTo(0.15);
  effect.reset();
  expect(material.map?.offset.toArray()).toEqual([0, 0]);
  effect.dispose();
  expect(material.map).toBe(original);
  assets.dispose();
});

test("layers jitter on the paint hook and restores both shader hooks when removed", () => {
  const definition = graph();
  definition.materials["materials/smoke.vmat"] = {
    m_intParams: [{ m_name: "F_JITTER_VERTICES", m_nValue: 1 }],
    m_textureParams: [{ m_name: "g_tJitterMask", m_pValue: "mask.vtex" }],
  };
  const assets = new ParticleAssets(definition, []);
  assets.textures.set("mask.vtex", {
    texture: new THREE.Texture(),
    sheet: { path: "mask.vtex", dataUrl: "", sequences: [] },
  });
  const material = new THREE.MeshStandardMaterial();
  material.userData.sourceMaterial = "materials/smoke.vmat";
  material.customProgramCacheKey = () => "paint";
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const model = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const effect = createMaterialMotion(model, assets);
  expect(material.onBeforeCompile).not.toBe(previousCompile);
  expect(material.customProgramCacheKey()).toBe("paint:source-jitter:1");
  effect.dispose();
  expect(material.onBeforeCompile).toBe(previousCompile);
  expect(material.customProgramCacheKey).toBe(previousKey);
  assets.dispose();
});
