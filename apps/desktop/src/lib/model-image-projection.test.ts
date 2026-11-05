import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  projectModelImage,
  projectModelImages,
  modelImageProjectionResolution,
  type ModelImageProjectionOptions,
  type ModelProjectionImage,
} from "./model-image-projection";

function fixture(): ModelImageProjectionOptions {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;
  const material = new THREE.MeshBasicMaterial();
  material.userData.sourceMaterial = "target.vmat";
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const root = new THREE.Group();
  root.add(mesh);
  return {
    root,
    camera,
    material: "target.vmat",
    image: {
      width: 2,
      height: 2,
      rgba: new Uint8Array([
        255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 0,
      ]),
    },
    viewport: { left: 0, top: 0, width: 100, height: 100 },
    center: { x: 50, y: 50 },
    size: { width: 100, height: 100 },
    resolution: 4,
  };
}
function pixel(result: ModelProjectionImage, x: number, y: number) {
  const start = (y * result.width + x) * 4;
  return Array.from(result.rgba.slice(start, start + 4));
}

describe("image projection", () => {
  test("projection detail shares a bounded animation budget instead of a fixed 512-pixel map", () => {
    expect(modelImageProjectionResolution(1)).toBe(1024);
    for (const count of [2, 41, 128]) {
      const resolution = modelImageProjectionResolution(count);
      expect(resolution * resolution * 4 * count).toBeLessThanOrEqual(
        64 * 1024 * 1024,
      );
    }
    expect(modelImageProjectionResolution(41)).toBeGreaterThan(512);
  });
  test("projects camera image into UV coordinates with transparency and no upload flip", () => {
    const result = projectModelImage(fixture());
    expect(pixel(result, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(result, 0, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(result, 3, 3)).toEqual([0, 255, 0, 128]);
    expect(pixel(result, 3, 0)).toEqual([0, 0, 0, 0]);
  });
  test("front geometry occludes target material while hidden occluders do not", () => {
    const options = fixture();
    const occluder = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 2),
      new THREE.MeshBasicMaterial(),
    );
    occluder.position.set(-0.5, 0, 1);
    options.root.add(occluder);
    expect(pixel(projectModelImage(options), 0, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(projectModelImage(options), 3, 3)).toEqual([0, 255, 0, 128]);
    occluder.visible = false;
    expect(pixel(projectModelImage(options), 0, 3)).toEqual([255, 0, 0, 255]);
  });
  test("never projects onto backfaces even for double-sided materials", () => {
    const options = fixture();
    options.root.rotation.y = Math.PI;
    options.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.Material
      )
        object.material.side = THREE.DoubleSide;
    });
    expect(projectModelImage(options).rgba.every((value) => value === 0)).toBe(
      true,
    );
  });
  test("stamp size, offset, and clockwise rotation control placement", () => {
    const options = fixture();
    options.size = { width: 50, height: 50 };
    options.center = { x: 25, y: 25 };
    const small = projectModelImage(options);
    expect(pixel(small, 0, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(small, 3, 3)).toEqual([0, 0, 0, 0]);
    const rotated = fixture();
    rotated.rotation = Math.PI;
    expect(pixel(projectModelImage(rotated), 0, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(projectModelImage(rotated), 3, 0)).toEqual([255, 0, 0, 255]);
  });
  test("projects animated skin vertices at their current positions", () => {
    const options = fixture();
    options.root.clear();
    const geometry = new THREE.PlaneGeometry(1, 2);
    const count = geometry.getAttribute("position").count;
    geometry.setAttribute(
      "skinIndex",
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute(
      "skinWeight",
      new THREE.Float32BufferAttribute(weights, 4),
    );
    const material = new THREE.MeshBasicMaterial();
    material.userData.sourceMaterial = "target.vmat";
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    bone.position.x = -0.5;
    options.root.add(mesh);
    const result = projectModelImage(options);
    expect(pixel(result, 3, 3)).toEqual([255, 0, 0, 255]);
  });
  test("works with perspective cameras on tilted surfaces without self-occlusion holes", () => {
    const options = fixture();
    options.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    options.camera.position.z = 5;
    options.root.rotation.y = 0.5;
    options.image = {
      width: 1,
      height: 1,
      rgba: new Uint8Array([10, 20, 30, 255]),
    };
    const result = projectModelImage(options);
    expect(pixel(result, 1, 1)).toEqual([10, 20, 30, 255]);
    expect(pixel(result, 2, 2)).toEqual([10, 20, 30, 255]);
  });
  test("repeat wrapping projects UV tiles outside the unit square after the texture matrix", () => {
    const options = fixture();
    options.root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshBasicMaterial)
      )
        return;
      const texture = new THREE.Texture();
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.flipY = false;
      object.material.map = texture;
      const uv = object.geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, uv.getX(i) + 2, uv.getY(i) + 2);
    });
    const originalTile = projectModelImage(options);
    expect(pixel(originalTile, 0, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(originalTile, 3, 3)).toEqual([0, 255, 0, 128]);
    options.root.traverse((object) => {
      if (
        object instanceof THREE.Mesh &&
        object.material instanceof THREE.MeshBasicMaterial &&
        object.material.map
      )
        object.material.map.offset.x = 0.25;
    });
    const result = projectModelImage(options);
    expect(pixel(result, 0, 3)).toEqual([0, 255, 0, 128]);
    expect(pixel(result, 1, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(result, 3, 3)).toEqual([0, 255, 0, 128]);
  });
  test("mirrored repeat preserves orientation in positive and negative odd tiles", () => {
    for (const tile of [1, -1]) {
      const options = fixture();
      options.root.traverse((object) => {
        if (
          !(object instanceof THREE.Mesh) ||
          !(object.material instanceof THREE.MeshBasicMaterial)
        )
          return;
        const texture = new THREE.Texture();
        texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
        object.material.map = texture;
        const uv = object.geometry.getAttribute("uv");
        for (let i = 0; i < uv.count; i++)
          uv.setXY(i, uv.getX(i) + tile, uv.getY(i) + tile);
      });
      const result = projectModelImage(options);
      expect(pixel(result, 3, 0)).toEqual([255, 0, 0, 255]);
      expect(pixel(result, 0, 0)).toEqual([0, 255, 0, 128]);
      expect(pixel(result, 3, 3)).toEqual([0, 0, 255, 255]);
    }
  });
  test("excessive periodic UV ranges fail before enumerating their tiles", () => {
    const options = fixture();
    options.root.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshBasicMaterial)
      )
        return;
      const texture = new THREE.Texture();
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.x = 1_000_000_000;
      object.material.map = texture;
    });
    expect(() => projectModelImage(options)).toThrow("projection budget");
  });
  test("batch frames share one posed geometry mapping and preserve per-frame alpha and timing", () => {
    const options = fixture();
    options.root.clear();
    class PosedMesh extends THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshBasicMaterial
    > {
      samples = 0;
      override getVertexPosition(index: number, target: THREE.Vector3) {
        this.samples++;
        return super.getVertexPosition(index, target);
      }
    }
    const material = new THREE.MeshBasicMaterial();
    material.userData.sourceMaterial = "target.vmat";
    const mesh = new PosedMesh(new THREE.PlaneGeometry(2, 2), material);
    options.root.add(mesh);
    const frames = [
      {
        rgba: new Uint8Array([255, 0, 0, 0]),
        width: 1,
        height: 1,
        durationMs: 40,
      },
      {
        rgba: new Uint8Array([0, 255, 0, 128]),
        width: 1,
        height: 1,
        durationMs: 170,
      },
      {
        rgba: new Uint8Array([0, 0, 255, 255, 255, 0, 0, 255]),
        width: 2,
        height: 1,
        durationMs: 90,
      },
    ];
    const results = projectModelImages({ ...options, frames });
    expect(mesh.samples).toBe(4);
    expect(results.map((frame) => frame.durationMs)).toEqual([40, 170, 90]);
    expect(pixel(results[0], 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(results[1], 0, 0)).toEqual([0, 255, 0, 128]);
    expect(pixel(results[2], 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(results[2], 3, 0)).toEqual([255, 0, 0, 255]);
  });
  test("rejects batches whose decoded outputs exceed the managed sequence budget", () => {
    const options = fixture();
    const frame = {
      rgba: new Uint8Array([0, 0, 0, 255]),
      width: 1,
      height: 1,
      durationMs: 10,
    };
    expect(() =>
      projectModelImages({
        ...options,
        resolution: 1024,
        frames: Array.from({ length: 33 }, () => frame),
      }),
    ).toThrow();
    expect(() =>
      projectModelImages({
        ...options,
        frames: Array.from({ length: 129 }, () => frame),
      }),
    ).toThrow();
  });
  test("rejects malformed image buffers and bounds requested output resolution", () => {
    const options = fixture();
    options.image.rgba = new Uint8Array(1);
    expect(() => projectModelImage(options)).toThrow();
    const bounded = fixture();
    bounded.root.clear();
    bounded.resolution = 100000;
    expect(projectModelImage(bounded).width).toBe(1024);
  });
});
