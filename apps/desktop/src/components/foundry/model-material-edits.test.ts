import { expect, test } from "bun:test";
import * as THREE from "three";
import { resetModelPart } from "@/lib/model-edit-history";
import { installModelMaterialEdits } from "./model-material-edits";

test("paint textures keep the native preview dimensions across animated frames", () => {
  const material = new THREE.MeshStandardMaterial();
  material.userData.sourceMaterial = "head.vmat";
  const root = new THREE.Group();
  const geometry = new THREE.PlaneGeometry();
  root.add(new THREE.Mesh(geometry, material));
  const apply = installModelMaterialEdits(root);
  const first = new Uint8Array(96 * 48 * 4).fill(20);
  const second = new Uint8Array(first.length).fill(90);
  apply(
    [{ ...resetModelPart("head.vmat"), paint: { layers: [] } }],
    new Map(),
    new Map([["head.vmat", first]]),
    new Map([
      [
        "head.vmat",
        {
          width: 96,
          height: 48,
          plays: 0,
          frames: [
            { pixels: first, durationMs: 100 },
            { pixels: second, durationMs: 100 },
          ],
        },
      ],
    ]),
  );
  const shader = {
    uniforms: { uModelAlbedoPaint: { value: new THREE.Texture() } },
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  // oxlint-disable-next-line anti-slop/no-reflect-apply
  Reflect.apply(material.onBeforeCompile, material, [shader]);
  const texture = shader.uniforms.uModelAlbedoPaint.value;
  if (!(texture instanceof THREE.DataTexture))
    throw new Error("Missing paint texture");
  expect([texture.image.width, texture.image.height]).toEqual([96, 48]);
  apply.tick({ time: 0.15, attributes: {} });
  expect(texture.image.data).toBe(second);
  expect([texture.image.width, texture.image.height]).toEqual([96, 48]);
  apply.dispose();
  material.dispose();
  geometry.dispose();
});

test("exact material identity controls every matching part and restores authored maps", () => {
  const root = new THREE.Group();
  const map = new THREE.Texture();
  const edited = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.4,
    roughnessMap: map,
    metalnessMap: map,
  });
  edited.userData.sourceMaterial = "materials/arm.vmat";
  const other = new THREE.MeshStandardMaterial();
  other.userData.sourceMaterial = "materials/arm_trim.vmat";
  const mesh = new THREE.Mesh(undefined, edited);
  const shellMaterial = new THREE.MeshBasicMaterial();
  const shell = new THREE.Mesh(undefined, shellMaterial);
  shell.userData.previewOutline = true;
  mesh.add(shell);
  root.add(
    mesh,
    new THREE.Mesh(undefined, edited),
    new THREE.Mesh(undefined, other),
  );
  const apply = installModelMaterialEdits(root);
  const initialKey = edited.customProgramCacheKey();
  apply([
    {
      ...resetModelPart("materials/arm.vmat"),
      hidden: true,
      roughness: 0.2,
      metalness: 1,
    },
  ]);
  expect(edited.visible).toBe(false);
  expect(shellMaterial.visible).toBe(false);
  expect(other.visible).toBe(true);
  expect(edited.roughness).toBe(0.2);
  expect(edited.metalness).toBe(1);
  expect(edited.roughnessMap).toBeNull();
  expect(edited.metalnessMap).toBeNull();
  apply([]);
  expect(edited.visible).toBe(true);
  expect(shellMaterial.visible).toBe(true);
  expect(edited.roughness).toBe(0.8);
  expect(edited.metalness).toBe(0.4);
  expect(edited.roughnessMap).toBe(map);
  expect(edited.metalnessMap).toBe(map);
  expect(edited.customProgramCacheKey()).toBe(initialKey);
});

test("patterns reuse textures and dynamic glow follows simulated health without changing source maps", () => {
  const root = new THREE.Group();
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map });
  material.userData.sourceMaterial = "materials/body.vmat";
  root.add(new THREE.Mesh(undefined, material));
  const apply = installModelMaterialEdits(root);
  apply(
    [
      {
        ...resetModelPart("materials/body.vmat"),
        pattern: {
          style: "liquid",
          intensity: 0.5,
          phase: 0,
          scroll: [0.1, 0],
        },
        parameters: [{ name: "F_SELF_ILLUM", values: [1] }],
        expressions: [
          {
            name: "g_flSelfIllumScale1",
            source: "(1 - saturate($ent_health)) * 10",
          },
        ],
      },
    ],
    new Map([["materials/body.vmat", new Uint8Array(128 * 128 * 4)]]),
  );
  expect(apply.tick({ time: 1, attributes: { $ent_health: 0.25 } })).toBe(true);
  expect(material.emissiveIntensity).toBeCloseTo(7.5);
  expect(material.map).toBe(map);
  apply([]);
  expect(material.emissiveIntensity).toBe(1);
  expect(material.emissive.getHex()).toBe(0);
  expect(apply.tick({ time: 2, attributes: {} })).toBe(false);
  apply.dispose();
  map.dispose();
  material.dispose();
});

test("albedo-driven glow preserves the authored emissive texture without recompiling on each tick", () => {
  const root = new THREE.Group();
  const map = new THREE.Texture();
  const emissiveMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map, emissiveMap });
  material.userData.sourceMaterial = "materials/body.vmat";
  root.add(new THREE.Mesh(undefined, material));
  const apply = installModelMaterialEdits(root);
  const version = material.version;
  apply([
    {
      ...resetModelPart("materials/body.vmat"),
      parameters: [
        { name: "F_SELF_ILLUM", values: [1] },
        { name: "g_flSelfIllumAlbedoFactor1", values: [1] },
        { name: "g_flSelfIllumScale1", values: [10] },
      ],
    },
  ]);
  expect(material.emissiveMap).toBe(emissiveMap);
  expect(material.emissiveIntensity).toBe(10);
  for (let frame = 0; frame < 60; frame++)
    expect(apply.tick({ time: frame / 60, attributes: {} })).toBe(false);
  expect(material.version).toBe(version);
  apply([]);
  expect(material.emissiveMap).toBe(emissiveMap);
  expect(material.emissiveIntensity).toBe(1);
  apply.dispose();
  map.dispose();
  emissiveMap.dispose();
  material.dispose();
});
