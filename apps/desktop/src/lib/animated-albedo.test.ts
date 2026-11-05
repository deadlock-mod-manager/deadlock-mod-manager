import { expect, test } from "bun:test";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
} from "three";
import { installAnimatedAlbedo } from "./animated-albedo";

function fixture() {
  const material = new MeshStandardMaterial();
  material.userData.source2Effect = {
    animatedAlbedo: {
      scale: [0.5, 1],
      offsets: [
        [0, 0],
        [0.5, 0],
      ],
      durationsMs: [100, 400],
      plays: 0,
    },
  };
  const root = new Group();
  const geometry = new PlaneGeometry();
  root.add(new Mesh(geometry, material), new Mesh(geometry, material));
  return { root, material };
}

test("saved GIF materials select a single atlas frame and can seek back to the first", () => {
  const { root, material } = fixture();
  const original = material.onBeforeCompile;
  const atlas = installAnimatedAlbedo(root);
  const uniforms: Record<string, { value: Vector2 }> = {};
  const shader = {
    vertexShader: "#include <uv_vertex>",
    fragmentShader: "",
    uniforms,
  };
  // oxlint-disable-next-line anti-slop/no-reflect-apply
  Reflect.apply(material.onBeforeCompile, material, [shader]);
  expect(atlas.active).toBe(true);
  expect(shader.vertexShader.match(/vMapUv =/g)).toHaveLength(1);
  atlas.update(0.1);
  expect(uniforms.uDmmAtlasOffset.value.toArray()).toEqual([0.5, 0]);
  atlas.update(0);
  expect(uniforms.uDmmAtlasOffset.value.toArray()).toEqual([0, 0]);
  atlas.update(0.5);
  expect(uniforms.uDmmAtlasOffset.value.toArray()).toEqual([0, 0]);
  expect(uniforms.uDmmAtlasScale.value.toArray()).toEqual([0.5, 1]);
  atlas.dispose();
  expect(material.onBeforeCompile).toBe(original);
});

test("full-frame paint editing bypasses the saved atlas transform", () => {
  const { root, material } = fixture();
  const original = material.onBeforeCompile;
  expect(installAnimatedAlbedo(root, true).active).toBe(false);
  expect(material.onBeforeCompile).toBe(original);
});

test("malformed saved animation metadata leaves the ordinary shader intact", () => {
  const { root, material } = fixture();
  material.userData.source2Effect.animatedAlbedo.durationsMs = [100];
  const original = material.onBeforeCompile;
  expect(installAnimatedAlbedo(root).active).toBe(false);
  expect(material.onBeforeCompile).toBe(original);
});
