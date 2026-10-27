import { expect, spyOn, test } from "bun:test";
import * as THREE from "three";
import type { FoundryParticleGraph } from "@/types/generated/FoundryParticleGraph";
import { ParticleAssets } from "./assets";

function graph(dataUrl: string): FoundryParticleGraph {
  return {
    roots: [],
    ambientRoots: [],
    castRoots: [],
    releaseRoots: [],
    ability: null,
    abilityEffects: [],
    attachments: {},
    systems: {},
    models: [],
    materials: {},
    warnings: [],
    textures: [{ path: "particles/spark.vtex", dataUrl, sequences: [] }],
  };
}

test("draft updates reuse unchanged textures and keep their GPU lease until disposal", async () => {
  const texture = new THREE.Texture<HTMLImageElement>();
  const disposed = spyOn(texture, "dispose");
  const load = spyOn(
    THREE.TextureLoader.prototype,
    "loadAsync",
  ).mockResolvedValue(texture);
  try {
    const first = new ParticleAssets(graph("same image"), []);
    await first.ready;
    const next = new ParticleAssets(graph("same image"), [], undefined, first);
    first.dispose();
    await next.ready;
    expect(load).toHaveBeenCalledTimes(1);
    expect(next.textures.get("particles/spark.vtex")?.texture).toBe(texture);
    expect(disposed).not.toHaveBeenCalled();
    next.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
  } finally {
    load.mockRestore();
    disposed.mockRestore();
  }
});

test("changed texture bytes replace the old texture on the next draft", async () => {
  const firstTexture = new THREE.Texture<HTMLImageElement>();
  const nextTexture = new THREE.Texture<HTMLImageElement>();
  const disposed = spyOn(firstTexture, "dispose");
  const load = spyOn(THREE.TextureLoader.prototype, "loadAsync")
    .mockResolvedValueOnce(firstTexture)
    .mockResolvedValueOnce(nextTexture);
  try {
    const first = new ParticleAssets(graph("original"), []);
    await first.ready;
    const next = new ParticleAssets(graph("edited"), [], undefined, first);
    first.dispose();
    await next.ready;
    expect(load).toHaveBeenCalledTimes(2);
    expect(next.textures.get("particles/spark.vtex")?.texture).toBe(
      nextTexture,
    );
    expect(disposed).toHaveBeenCalledTimes(1);
    next.dispose();
  } finally {
    load.mockRestore();
    disposed.mockRestore();
  }
});
