import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { installSource2Color } from "../components/foundry/source2-material";
import { installModelMaterialEdits } from "../components/foundry/model-material-edits";
import { defaultImageAlignment } from "./model-image-placement";
import {
  installModelImageSurfacePreview,
  writeImagePreviewFrame,
  type ModelImageSurfaceDraft,
} from "./model-image-surface-preview";

function compile(material: THREE.Material) {
  const uniforms: Record<
    string,
    { value: number | THREE.Vector2 | THREE.Vector4 | THREE.Texture }
  > = {};
  const shader = {
    uniforms,
    vertexShader: "",
    fragmentShader:
      "void main() {\n#include <map_fragment>\n#include <color_fragment>\n#include <alphamap_fragment>\n}",
  };
  // oxlint-disable-next-line anti-slop/no-reflect-apply
  Reflect.apply(material.onBeforeCompile, material, [shader]);
  return shader;
}

function fixture() {
  const root = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial();
  const head = new THREE.MeshBasicMaterial();
  coat.userData.sourceMaterial = "coat.vmat";
  head.userData.sourceMaterial = "head.vmat";
  root.add(
    new THREE.Mesh(new THREE.PlaneGeometry(), coat),
    new THREE.Mesh(new THREE.PlaneGeometry(), head),
  );
  const original = coat.onBeforeCompile;
  const preview = installModelImageSurfacePreview(root);
  const draft: ModelImageSurfaceDraft = {
    material: "coat.vmat",
    alignment: defaultImageAlignment(),
    plays: 0,
    frames: [
      {
        rgba: new Uint8Array([255, 0, 0, 255]),
        width: 1,
        height: 1,
        durationMs: 100,
      },
      {
        rgba: new Uint8Array([0, 255, 0, 128]),
        width: 1,
        height: 1,
        durationMs: 100,
      },
    ],
  };
  return { preview, coat, head, draft, compile, original };
}

describe("surface-conforming image preview", () => {
  test("the live projection survives Source 2 and material-edit shader composition", () => {
    const material = new THREE.MeshStandardMaterial();
    material.userData.sourceMaterial = "coat.vmat";
    material.userData.source2 = {
      schemaVersion: 1,
      shader: "pbr.vfx",
      blendMode: "opaque",
      unlit: false,
      color: {
        tint: [1, 1, 1],
        tintMode: 0,
        contrastSaturationBrightness: [1, 1, 1],
        reflectivity: [0.5, 0.5, 0.5],
        maskColorTint: false,
        maskVertexColor: false,
        vertexColorBeforeCorrection: false,
        vertexColorStrength: 1,
        tintMaskTexture: null,
      },
    };
    expect(installSource2Color(material, new Map(), true)).toBe(true);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    const edits = installModelMaterialEdits(root);
    const preview = installModelImageSurfacePreview(root);
    const shader = compile(material);
    expect(shader.fragmentShader).not.toContain("#include <color_fragment>");
    expect(shader.fragmentShader).toContain("vec2 imagePoint");
    expect(shader.fragmentShader.indexOf("vec2 imagePoint")).toBeLessThan(
      shader.fragmentShader.indexOf("#include <alphamap_fragment>"),
    );
    preview.dispose();
    edits.dispose();
  });
  test("only the selected material receives the projection; cancelling restores it without touching authored maps", () => {
    const { preview, coat, head, draft, compile } = fixture();
    const map = new THREE.Texture();
    coat.map = map;
    const a = compile(coat),
      b = compile(head);
    expect(preview.update(draft, 0, { x: 800, y: 400 })).toBe(true);
    expect(a.uniforms.uImageDraftActive.value).toBe(1);
    expect(b.uniforms.uImageDraftActive.value).toBe(0);
    expect(a.fragmentShader).toContain("gl_FrontFacing");
    expect(a.fragmentShader).toContain("gl_FragCoord");
    expect(a.fragmentShader).toContain("sRGBTransferEOTF");
    expect(coat.map).toBe(map);
    expect(preview.update(null, 20, { x: 800, y: 400 })).toBe(true);
    expect(a.uniforms.uImageDraftActive.value).toBe(0);
    expect(preview.update(null, 30, { x: 800, y: 400 })).toBe(false);
    preview.dispose();
  });
  test("drag updates uniforms without recompiling or reuploading the same GIF frame", () => {
    const { preview, coat, draft, compile } = fixture();
    const shader = compile(coat);
    preview.update(draft, 0, { x: 800, y: 400 });
    const texture = shader.uniforms.uImageDraftTexture.value;
    if (!(texture instanceof THREE.DataTexture))
      throw new Error("Missing draft texture");
    const version = texture.version,
      materialVersion = coat.version;
    for (let i = 0; i < 100; i++)
      preview.update(
        { ...draft, alignment: { ...draft.alignment, center: [i / 100, 0.5] } },
        i * 0.5,
        { x: 800, y: 400 },
      );
    expect(texture.version).toBe(version);
    expect(coat.version).toBe(materialVersion);
    expect(preview.update(draft, 110, { x: 800, y: 400 })).toBe(true);
    expect(texture.version).toBe(version + 1);
    expect(Array.from(texture.image.data ?? [])).toEqual([0, 255, 0, 128]);
    preview.dispose();
  });
  test("crop and rotation use rounded source pixels and physical framebuffer dimensions", () => {
    const { preview, coat, draft, compile, original } = fixture();
    const shader = compile(coat);
    const image = {
      rgba: new Uint8Array(3 * 2 * 4),
      width: 3,
      height: 2,
      durationMs: 100,
    };
    preview.update(
      {
        ...draft,
        frames: [image],
        alignment: {
          ...draft.alignment,
          scale: 0.25,
          rotation: Math.PI / 2,
          crop: { left: 0.2, top: 0, right: 0.8, bottom: 1 },
        },
      },
      0,
      { x: 1600, y: 800 },
    );
    const crop = shader.uniforms.uImageDraftCrop.value;
    const size = shader.uniforms.uImageDraftSize.value;
    const rotation = shader.uniforms.uImageDraftRotation.value;
    expect(crop instanceof THREE.Vector4 && crop.toArray()).toEqual([
      1 / 3,
      0,
      2 / 3,
      1,
    ]);
    expect(size instanceof THREE.Vector2 && size.toArray()).toEqual([
      400,
      (400 * 2) / 3,
    ]);
    expect(rotation instanceof THREE.Vector2 && rotation.y).toBeCloseTo(1);
    preview.dispose();
    expect(coat.onBeforeCompile).toBe(original);
  });
  test("large GIF uploads are bounded and reuse one buffer without changing export pixels", () => {
    const frame = {
      rgba: new Uint8Array(2048 * 1024 * 4).fill(73),
      width: 2048,
      height: 1024,
      durationMs: 100,
    };
    const first = writeImagePreviewFrame(frame);
    expect([first.width, first.height, first.data.length]).toEqual([
      512,
      256,
      512 * 256 * 4,
    ]);
    const second = writeImagePreviewFrame(frame, first.data);
    expect(second.data).toBe(first.data);
    expect(second.data[second.data.length - 1]).toBe(73);
    expect(frame.rgba).toHaveLength(2048 * 1024 * 4);
  });
  test("GPU storage is reallocated when import dimensions change, then reused for animation", () => {
    const { preview, coat, draft, compile } = fixture();
    const shader = compile(coat);
    const texture = shader.uniforms.uImageDraftTexture.value;
    if (!(texture instanceof THREE.DataTexture))
      throw new Error("Missing draft texture");
    let released = 0;
    texture.addEventListener("dispose", () => released++);
    const resized = {
      ...draft,
      frames: draft.frames.map((frame) => ({
        durationMs: frame.durationMs,
        rgba: new Uint8Array(4 * 2 * 4),
        width: 4,
        height: 2,
      })),
    };
    preview.update(resized, 0, { x: 800, y: 400 });
    expect(released).toBe(1);
    const buffer = texture.image.data;
    preview.update(resized, 110, { x: 800, y: 400 });
    expect(released).toBe(1);
    expect(texture.image.data).toBe(buffer);
    preview.dispose();
    expect(released).toBe(2);
  });
});
