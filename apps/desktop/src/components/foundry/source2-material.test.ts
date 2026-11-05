import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { installPaintShader } from "./workbench-paint-shader";
import {
  applySource2DrawState,
  colorCorrection,
  colorTint,
  disposeSource2Textures,
  installSource2Color,
  loadSource2Textures,
  source2Metadata,
} from "./source2-material";

const metadata = () => ({
  schemaVersion: 1,
  shader: "pbr.vfx",
  blendMode: "opaque",
  unlit: false,
  color: {
    tint: [0.2, 0.4, 0.6],
    tintMode: 0,
    contrastSaturationBrightness: [1, 1, 1],
    reflectivity: [0.1, 0.3, 0.7],
    maskColorTint: true,
    maskVertexColor: true,
    vertexColorBeforeCorrection: false,
    vertexColorStrength: 1,
    tintMaskTexture: null,
  },
});
const corrected = (input: number[], csb: number[], pivot: number[]) => {
  const plan = colorCorrection(csb, pivot);
  return new THREE.Vector3(...input).applyMatrix3(plan.matrix).add(plan.offset);
};

test("separate source meshes can reserve distinct tint-mask indices even when a mask is missing", async () => {
  const gltf = await new GLTFLoader().parseAsync(
    JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] }),
    "",
  );
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2 = {
    ...metadata(),
    color: { ...metadata().color, tintMaskTexture: 3 },
  };
  gltf.scene.add(new THREE.Mesh(undefined, material));
  const texture = new THREE.Texture();
  const load = spyOn(gltf.parser, "getDependency").mockResolvedValue(texture);
  const textures = await loadSource2Textures(gltf, 4);
  expect(load).toHaveBeenCalledWith("texture", 3);
  expect(textures.get(7)).toBe(texture);
  expect(textures.has(3)).toBe(false);
  expect(source2Metadata(material)?.color?.tintMaskTexture).toBe(7);
  material.userData.source2 = {
    ...metadata(),
    color: { ...metadata().color, tintMaskTexture: 3 },
  };
  load.mockRejectedValueOnce(new Error("Missing mask"));
  const missing = await loadSource2Textures(gltf, 8);
  expect(missing.size).toBe(0);
  expect(source2Metadata(material)?.color?.tintMaskTexture).toBe(11);
  expect(installSource2Color(material, missing)).toBe(false);
});

test("contrast uses each channel's linear reflectivity and preserves HDR", () => {
  const pivot: [number, number, number] = [0.1, 0.3, 0.7];
  expect(corrected(pivot, [2, 1, 1], pivot).toArray()).toEqual(pivot);
  const result = corrected([0.8, 0.1, 0], [2, 1, 2], pivot);
  expect(result.x).toBeCloseTo(3);
  expect(result.y).toBeCloseTo(-0.2);
  expect(result.z).toBeCloseTo(-1.4);
});

test("saturation follows squared Rec.709 weights after contrast and brightness", () => {
  const result = corrected([1, 0, 0], [1, 0, 1], [0.2, 0.2, 0.2]);
  const gray = 0.2126 ** 2 / (0.2126 ** 2 + 0.7152 ** 2 + 0.0722 ** 2);
  for (const channel of result.toArray()) expect(channel).toBeCloseTo(gray, 8);
});

test("tint modes multiply, double, or recolor around the authored tint", () => {
  const tint = [0.2, 0.4, 0.6];
  for (const mode of [0, 2]) {
    const plan = colorTint(tint, mode);
    const actual = new THREE.Vector3(0.5, 0.5, 0.5)
      .applyMatrix3(plan.matrix)
      .add(plan.offset);
    actual
      .toArray()
      .forEach((value, i) =>
        expect(value).toBeCloseTo(tint[i] * (mode === 2 ? 1 : 0.5)),
      );
  }
  const plan = colorTint(tint, 1);
  const actual = new THREE.Vector3(...tint)
    .applyMatrix3(plan.matrix)
    .add(plan.offset);
  actual.toArray().forEach((value, i) => expect(value).toBeCloseTo(tint[i]));
});

test("additive overlays remain depth-tested without occluding and sort after translucent bodies", () => {
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2 = {
    ...metadata(),
    blendMode: "additive",
    unlit: true,
  };
  const mesh = new THREE.Mesh(undefined, material);
  applySource2DrawState(mesh, material);
  expect(material.transparent).toBe(true);
  expect(material.blending).toBe(THREE.AdditiveBlending);
  expect(material.depthWrite).toBe(false);
  expect(material.depthTest).toBe(true);
  expect(material.toneMapped).toBe(false);
  expect(mesh.renderOrder).toBe(2);
  material.userData.source2.blendMode = "translucent";
  material.blending = THREE.NormalBlending;
  mesh.renderOrder = 0;
  applySource2DrawState(mesh, material);
  expect(material.depthWrite).toBe(true);
  expect(mesh.renderOrder).toBe(1);
});

test("legacy and future-schema GLBs keep their existing material state", () => {
  for (const data of [undefined, { ...metadata(), schemaVersion: 2 }]) {
    const material = new THREE.MeshStandardMaterial({
      transparent: true,
      depthWrite: false,
    });
    material.userData.source2 = data;
    const mesh = new THREE.Mesh(undefined, material);
    applySource2DrawState(mesh, material);
    expect(material.depthWrite).toBe(false);
    expect(mesh.renderOrder).toBe(0);
    expect(installSource2Color(material, new Map())).toBe(false);
  }
});

test("color hook takes ownership only of matching exporter factors and available masks", () => {
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2 = metadata();
  material.color.setRGB(0.2, 0.4, 0.6);
  expect(installSource2Color(material, new Map())).toBe(true);
  expect(material.color.toArray()).toEqual([1, 1, 1]);
  const colorKey = material.customProgramCacheKey();
  installPaintShader(material);
  expect(material.customProgramCacheKey()).toBe(`${colorKey}:foundry-paint`);
  const edited = new THREE.MeshStandardMaterial({ color: "red" });
  edited.userData.source2 = metadata();
  expect(installSource2Color(edited, new Map())).toBe(false);
  const masked = new THREE.MeshStandardMaterial();
  masked.color.setRGB(0.2, 0.4, 0.6);
  masked.userData.source2 = {
    ...metadata(),
    color: { ...metadata().color, tintMaskTexture: 3 },
  };
  expect(installSource2Color(masked, new Map())).toBe(false);
  expect(masked.color.toArray()).toEqual([0.2, 0.4, 0.6]);
  expect(installSource2Color(masked, new Map([[3, new THREE.Texture()]]))).toBe(
    true,
  );
});

test("extra tint masks load once as linear data and are disposed once", async () => {
  const gltf = await new GLTFLoader().parseAsync(
    JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], scene: 0 }),
    "",
  );
  for (let i = 0; i < 2; i++) {
    const material = new THREE.MeshStandardMaterial();
    material.userData.source2 = {
      ...metadata(),
      color: { ...metadata().color, tintMaskTexture: 3 },
    };
    gltf.scene.add(new THREE.Mesh(undefined, material));
  }
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  const load = spyOn(gltf.parser, "getDependency").mockResolvedValue(texture);
  const textures = await loadSource2Textures(gltf);
  expect(load).toHaveBeenCalledTimes(1);
  expect(textures.get(3)).toBe(texture);
  expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  const dispose = spyOn(texture, "dispose");
  disposeSource2Textures(textures);
  expect(dispose).toHaveBeenCalledTimes(1);
});

test("identity uncolored materials skip tint-mask loading and the color shader", async () => {
  const gltf = await new GLTFLoader().parseAsync(
    JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] }),
    "",
  );
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2 = {
    ...metadata(),
    color: { ...metadata().color, tint: [1, 1, 1], tintMaskTexture: 3 },
  };
  gltf.scene.add(new THREE.Mesh(undefined, material));
  const load = spyOn(gltf.parser, "getDependency").mockResolvedValue(
    new THREE.Texture(),
  );
  const textures = await loadSource2Textures(gltf);
  expect(load).not.toHaveBeenCalled();
  const original = material.onBeforeCompile;
  expect(installSource2Color(material, textures)).toBe(false);
  expect(material.onBeforeCompile).toBe(original);
});

test("color-corrected uncolored materials need no tint mask when their tint is white", async () => {
  const gltf = await new GLTFLoader().parseAsync(
    JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] }),
    "",
  );
  const material = new THREE.MeshStandardMaterial();
  material.userData.source2 = {
    ...metadata(),
    color: {
      ...metadata().color,
      tint: [1, 1, 1],
      contrastSaturationBrightness: [1, 1.12, 1.21],
      tintMaskTexture: 3,
    },
  };
  gltf.scene.add(new THREE.Mesh(undefined, material));
  const load = spyOn(gltf.parser, "getDependency").mockResolvedValue(
    new THREE.Texture(),
  );
  const textures = await loadSource2Textures(gltf);
  expect(load).not.toHaveBeenCalled();
  expect(installSource2Color(material, textures)).toBe(true);
});

test("vertex-color masking still loads its mask even with white tint", async () => {
  const gltf = await new GLTFLoader().parseAsync(
    JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] }),
    "",
  );
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.userData.source2 = {
    ...metadata(),
    color: { ...metadata().color, tint: [1, 1, 1], tintMaskTexture: 3 },
  };
  gltf.scene.add(new THREE.Mesh(undefined, material));
  const load = spyOn(gltf.parser, "getDependency").mockResolvedValue(
    new THREE.Texture(),
  );
  const textures = await loadSource2Textures(gltf);
  expect(load).toHaveBeenCalledTimes(1);
  expect(installSource2Color(material, textures)).toBe(true);
});
