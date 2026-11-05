import { expect, test } from "bun:test";
import * as THREE from "three";
import { shareSourceModelImages } from "./source-model-images";
import { disposeModelScene, modelSceneBytes } from "./model-scene-resources";

test("source LODs share named material image data without sharing texture transforms", () => {
  const scene = new THREE.Group();
  const textures = Array.from({ length: 3 }, () => {
    const texture = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
    texture.name = "materials/body_color.vtex";
    return texture;
  });
  for (const [index, map] of textures.entries()) {
    const material = new THREE.MeshStandardMaterial({ map });
    material.userData.sourceMaterial =
      index === 2 ? "materials/other.vmat" : "materials/body.vmat";
    scene.add(new THREE.Mesh(undefined, material));
  }
  const model = { scene, source2Textures: new Map<number, THREE.Texture>() };
  const before = modelSceneBytes(model);
  shareSourceModelImages(scene, model.source2Textures);
  expect(textures[0].source).toBe(textures[1].source);
  expect(textures[0].source).not.toBe(textures[2].source);
  textures[0].offset.x = 0.5;
  expect(textures[1].offset.x).toBe(0);
  expect(modelSceneBytes(model)).toBeLessThan(before);
  disposeModelScene(model);
});
